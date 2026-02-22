import { nanoid } from 'nanoid';
import { Knn, Search, K } from 'chromadb';

import type { FactsAppDatabase } from '@/db/facts';
import { getOrCreateBrainCollection } from '@/lib/chromadb/client';
import { syncFactToChroma } from '@/lib/chromadb/sync';
import { createFact } from '@/lib/services/fact-service';
import {
  computeTrustScore,
  AUTO_APPROVE_THRESHOLD,
} from '@/lib/services/trust-score-service';
import {
  getOrCreateTopic,
  linkFactToTopic,
  updateCoverageScore,
} from '@/lib/services/topic-service';

// --- Types ---

export interface DescribeBuildInput {
  brainId: string;
  description: string;
  userId: string;
}

export interface DescribeBuildResult {
  factsCreated: Array<{
    id: string;
    content: string;
    type: string;
    trustScore: number;
  }>;
  topicsCreated: string[];
  questionsForUser: Array<{
    question: string;
    topic: string;
    reasoning: string;
  }>;
}

interface LLMGeneratedFact {
  content: string;
  type: 'general' | 'policy' | 'procedure' | 'definition' | 'decision' | 'insight';
  confidence: number;
  topics: string[];
  reasoning: string;
}

interface LLMGeneratedTopic {
  name: string;
  description: string;
}

interface LLMQuestion {
  question: string;
  topic: string;
  reasoning: string;
}

interface LLMResponse {
  facts: LLMGeneratedFact[];
  topics: LLMGeneratedTopic[];
  questionsForUser: LLMQuestion[];
}

// --- System Prompt ---

const SYSTEM_PROMPT = `You are a knowledge builder agent. Given a user's description of a project, product, system, business rule, or domain, your job is to:

1. Generate atomic, self-contained facts that can be derived from the description
2. Identify topics to organize these facts
3. Ask follow-up questions to fill knowledge gaps

## Rules for Fact Generation

- Each fact must be a single, atomic statement that stands alone
- Facts must be in present tense, third person, declarative form
- Only generate facts that are clearly stated or strongly implied by the description
- Do NOT invent or assume details not present in the description
- Classify each fact: general, policy, procedure, definition, decision, insight
- Assign confidence (0.0-1.0) based on how directly the fact follows from the description

## Rules for Questions

- Ask specific, actionable questions that would yield important facts
- Focus on gaps: what is mentioned but not explained, what is implied but not stated
- Prioritize questions that would unlock the most new facts
- Limit to 5-8 high-value questions

## Handling Existing Context

If existing facts are provided, do NOT generate facts that duplicate them. Focus on new information from the description that adds to or complements existing knowledge.

## Output Format

Respond with valid JSON:
{
  "facts": [
    {
      "content": "atomic fact statement",
      "type": "general|policy|procedure|definition|decision|insight",
      "confidence": 0.0-1.0,
      "topics": ["Topic Name"],
      "reasoning": "why this was generated"
    }
  ],
  "topics": [
    { "name": "Topic Name", "description": "what this topic covers" }
  ],
  "questionsForUser": [
    {
      "question": "specific question to ask the user",
      "topic": "Topic Name",
      "reasoning": "why this question matters"
    }
  ]
}`;

// --- Implementation ---

export async function describeAndBuild(
  factsDb: FactsAppDatabase,
  env: Env,
  input: DescribeBuildInput
): Promise<DescribeBuildResult> {
  // 1. Get existing context from the brain
  let existingFacts: Array<{
    id: string;
    content: string;
    type: string;
    trustScore: number;
  }> = [];

  try {
    const collection = await getOrCreateBrainCollection(env, input.brainId);
    const search = new Search()
      .rank(Knn({ query: input.description, returnRank: true, limit: 50 }))
      .limit(50)
      .select(K.DOCUMENT, K.SCORE, 'factId', 'type', 'trustScore');

    const results = await collection.search(search);
    const rows = results.rows()[0] ?? [];
    existingFacts = rows.map((row) => ({
      id: (row.metadata?.factId as string) ?? row.id,
      content: row.document ?? '',
      type: (row.metadata?.type as string) ?? 'general',
      trustScore: (row.metadata?.trustScore as number) ?? 0.5,
    }));
  } catch {
    // Empty collection — no existing facts
  }

  const existingTopics = await factsDb
    .selectFrom('topic')
    .where('brainId', '=', input.brainId)
    .where('status', '=', 'active')
    .select(['name', 'description'])
    .execute();

  // 2. Build the prompt
  const userParts: string[] = [];
  userParts.push('## User Description');
  userParts.push(input.description);
  userParts.push('');

  if (existingFacts.length > 0) {
    userParts.push('## Existing Facts in This Brain');
    for (const f of existingFacts) {
      userParts.push(
        `[${f.id}] (${f.type}, trust: ${f.trustScore.toFixed(2)}): ${f.content}`
      );
    }
    userParts.push('');
  }

  if (existingTopics.length > 0) {
    userParts.push('## Existing Topics');
    for (const t of existingTopics) {
      userParts.push(`- ${t.name}: ${t.description || 'No description'}`);
    }
    userParts.push('');
  }

  // 3. Call Claude
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userParts.join('\n') }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content.find((b) => b.type === 'text');
  if (!textBlock?.text) {
    throw new Error('No text response from Anthropic API');
  }

  const parsed = parseLLMResponse(textBlock.text);

  // 4. Persist generated facts
  const now = new Date().toISOString();
  const factsCreated: DescribeBuildResult['factsCreated'] = [];
  const topicsCreated: string[] = [];

  // Create an ingestion record for tracking
  const ingestionId = nanoid();
  await factsDb
    .insertInto('ingestion')
    .values({
      id: ingestionId,
      brainId: input.brainId,
      sourceType: 'text_input',
      title: 'Describe & Build: ' + input.description.slice(0, 80),
      rawText: input.description,
      r2Key: null,
      mimeType: null,
      fileSizeBytes: null,
      status: 'processing',
      factCount: 0,
      errorMessage: null,
      metadata: JSON.stringify({ type: 'describe_and_build' }),
      createdAt: now,
      updatedAt: now,
      createdBy: input.userId,
    })
    .execute();

  // Create topics
  for (const topicData of parsed.topics) {
    const topic = await getOrCreateTopic(
      factsDb,
      input.brainId,
      topicData.name,
      topicData.description
    );
    // Check if it was newly created by comparing names with existing
    if (!existingTopics.some((t: { name: string }) => t.name === topicData.name)) {
      topicsCreated.push(topicData.name);
    }
    await updateCoverageScore(factsDb, topic.id);
  }

  // Create facts
  for (const candidate of parsed.facts) {
    const trustScore = computeTrustScore({
      extractionConfidence: candidate.confidence,
      sourceAuthority: 0.7, // User description is moderate authority
      sourceCount: 1,
      corroborationCount: 0,
      citationCount: 0,
      openQuestionCount: 0,
      totalQuestionCount: 0,
      hasConflict: false,
    });

    const status =
      trustScore >= AUTO_APPROVE_THRESHOLD ? 'active' : 'pending_review';

    const fact = await createFact(factsDb, env, {
      brainId: input.brainId,
      content: candidate.content,
      type: candidate.type,
      status,
      trustScore,
      sourceAuthority: 0.7,
      extractionConfidence: candidate.confidence,
      userId: input.userId,
    });

    if (fact) {
      factsCreated.push({
        id: fact.id,
        content: fact.content,
        type: fact.type,
        trustScore: fact.trustScore,
      });

      // Record ingestion link
      await factsDb
        .insertInto('ingestion_fact')
        .values({
          id: nanoid(),
          ingestionId,
          factId: fact.id,
          action: 'created',
          extractionConfidence: candidate.confidence,
          createdAt: now,
        })
        .execute();

      // Link to topics
      for (const topicName of candidate.topics) {
        const topic = await getOrCreateTopic(factsDb, input.brainId, topicName);
        await linkFactToTopic(factsDb, topic.id, fact.id);
      }
    }
  }

  // Update ingestion record
  await factsDb
    .updateTable('ingestion')
    .set({
      status: 'completed',
      factCount: factsCreated.length,
      updatedAt: new Date().toISOString(),
    })
    .where('id', '=', ingestionId)
    .execute();

  return {
    factsCreated,
    topicsCreated,
    questionsForUser: parsed.questionsForUser,
  };
}

function parseLLMResponse(text: string): LLMResponse {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);

  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    questionsForUser: Array.isArray(parsed.questionsForUser)
      ? parsed.questionsForUser
      : [],
  };
}
