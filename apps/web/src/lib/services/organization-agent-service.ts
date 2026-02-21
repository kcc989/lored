import { nanoid } from 'nanoid';

import type { FactsAppDatabase } from '@/db/facts';
import { updateCoverageScore } from '@/lib/services/topic-service';

// --- Types ---

export interface OrganizeBrainInput {
  brainId: string;
}

export interface TopicHierarchyNode {
  topicId: string;
  name: string;
  description: string;
  factCount: number;
  coverageScore: number;
  summary: string;
  keyInsights: string[];
  children: TopicHierarchyNode[];
}

export interface OrganizeBrainResult {
  brainSummary: string;
  topicHierarchy: TopicHierarchyNode[];
  totalFacts: number;
  totalTopics: number;
  averageCoverage: number;
  topicsReorganized: number;
  summariesGenerated: number;
}

export interface BrainSummaryView {
  brainId: string;
  summary: string;
  topicHierarchy: TopicHierarchyNode[];
  totalFacts: number;
  totalTopics: number;
  averageCoverage: number;
  generatedAt: string;
  version: number;
}

// --- Claude Prompt ---

const ORGANIZATION_SYSTEM_PROMPT = `You are a knowledge organization agent. Given a set of topics and their associated facts within a knowledge base, your job is to organize them into a coherent structure.

## Tasks

1. **Organize topics into a hierarchy** — group related topics under parent categories. Create logical groupings where natural relationships exist. Not every topic needs a parent; top-level topics are fine.

2. **Generate summaries** — for each topic, write a concise 2-3 sentence summary based on its facts. Also identify 3-5 key insights as brief bullet points.

3. **Generate a brain summary** — write a comprehensive 3-5 sentence overview of the entire knowledge base.

4. **Identify knowledge gaps** — suggest new questions for topics that seem incomplete.

## Output Format

Respond with valid JSON matching this schema:

{
  "brainSummary": "overall summary of the knowledge base",
  "topicOrganization": [
    {
      "topicId": "existing-topic-id",
      "parentTopicId": null,
      "summary": "2-3 sentence topic summary",
      "keyInsights": ["insight 1", "insight 2", "insight 3"]
    }
  ],
  "newQuestions": [
    {
      "topicName": "Topic Name",
      "question": "specific question about a knowledge gap",
      "priority": "low|normal|high|critical"
    }
  ]
}

## Rules
- Use ONLY existing topicId values in your response
- Set parentTopicId to another existing topicId to create hierarchy, or null for top-level
- Do not create circular hierarchies
- Every topic must appear exactly once in topicOrganization`;

// --- Implementation ---

const MAX_FACTS_PER_TOPIC = 10;
const MAX_TOPICS = 100;

export async function organizeBrain(
  factsDb: FactsAppDatabase,
  env: Env,
  input: OrganizeBrainInput
): Promise<OrganizeBrainResult> {
  // 1. Gather all topics
  const topics = await factsDb
    .selectFrom('topic')
    .where('brainId', '=', input.brainId)
    .where('status', '=', 'active')
    .selectAll()
    .orderBy('factCount', 'desc')
    .limit(MAX_TOPICS)
    .execute();

  if (topics.length === 0) {
    return {
      brainSummary: 'This brain has no topics yet.',
      topicHierarchy: [],
      totalFacts: 0,
      totalTopics: 0,
      averageCoverage: 0,
      topicsReorganized: 0,
      summariesGenerated: 0,
    };
  }

  // 2. Get facts for each topic (top N by trust score)
  const topicsWithFacts = await Promise.all(
    topics.map(async (topic) => {
      const facts = await factsDb
        .selectFrom('topic_fact')
        .innerJoin('fact', 'fact.id', 'topic_fact.factId')
        .where('topic_fact.topicId', '=', topic.id)
        .where('fact.status', 'in', ['active', 'pending_review'])
        .select([
          'fact.id',
          'fact.content',
          'fact.type',
          'fact.trustScore',
        ])
        .orderBy('fact.trustScore', 'desc')
        .limit(MAX_FACTS_PER_TOPIC)
        .execute();
      return { ...topic, facts };
    })
  );

  // 3. Count total facts
  const factCountResult = await factsDb
    .selectFrom('fact')
    .where('brainId', '=', input.brainId)
    .where('status', 'in', ['active', 'pending_review'])
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();
  const totalFacts = Number(factCountResult?.count ?? 0);

  // 4. Build prompt
  const userMessage = buildOrganizationMessage(topicsWithFacts);

  // 5. Call Claude
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
      system: ORGANIZATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
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

  const parsed = parseOrganizationResponse(textBlock.text);

  // 6. Persist results
  const now = new Date().toISOString();
  const topicMap = new Map(topics.map((t) => [t.id, t]));
  let topicsReorganized = 0;
  let summariesGenerated = 0;

  // Update topic hierarchy and summaries
  for (const item of parsed.topicOrganization) {
    if (!topicMap.has(item.topicId)) continue;

    // Update parentTopicId
    await factsDb
      .updateTable('topic')
      .set({
        parentTopicId: item.parentTopicId,
        updatedAt: now,
      })
      .where('id', '=', item.topicId)
      .execute();
    topicsReorganized++;

    // Upsert topic summary
    const existingSummary = await factsDb
      .selectFrom('topic_summary')
      .where('topicId', '=', item.topicId)
      .selectAll()
      .executeTakeFirst();

    if (existingSummary) {
      await factsDb
        .updateTable('topic_summary')
        .set({
          summary: item.summary,
          keyInsights: JSON.stringify(item.keyInsights),
          version: existingSummary.version + 1,
          generatedAt: now,
          updatedAt: now,
        })
        .where('id', '=', existingSummary.id)
        .execute();
    } else {
      await factsDb
        .insertInto('topic_summary')
        .values({
          id: nanoid(),
          topicId: item.topicId,
          brainId: input.brainId,
          summary: item.summary,
          keyInsights: JSON.stringify(item.keyInsights),
          version: 1,
          generatedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
    summariesGenerated++;

    // Update coverage score
    await updateCoverageScore(factsDb, item.topicId);
  }

  // Build hierarchy tree for storage
  const hierarchyTree = buildHierarchyTree(
    topicsWithFacts,
    parsed.topicOrganization
  );

  // Calculate average coverage
  const coverageSum = topics.reduce((sum, t) => sum + t.coverageScore, 0);
  const averageCoverage =
    topics.length > 0 ? coverageSum / topics.length : 0;

  // Upsert brain summary
  const existingBrainSummary = await factsDb
    .selectFrom('brain_summary')
    .where('brainId', '=', input.brainId)
    .selectAll()
    .executeTakeFirst();

  if (existingBrainSummary) {
    await factsDb
      .updateTable('brain_summary')
      .set({
        summary: parsed.brainSummary,
        topicHierarchy: JSON.stringify(hierarchyTree),
        totalFacts,
        totalTopics: topics.length,
        averageCoverage,
        version: existingBrainSummary.version + 1,
        generatedAt: now,
        updatedAt: now,
      })
      .where('id', '=', existingBrainSummary.id)
      .execute();
  } else {
    await factsDb
      .insertInto('brain_summary')
      .values({
        id: nanoid(),
        brainId: input.brainId,
        summary: parsed.brainSummary,
        topicHierarchy: JSON.stringify(hierarchyTree),
        totalFacts,
        totalTopics: topics.length,
        averageCoverage,
        version: 1,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
  }

  return {
    brainSummary: parsed.brainSummary,
    topicHierarchy: hierarchyTree,
    totalFacts,
    totalTopics: topics.length,
    averageCoverage,
    topicsReorganized,
    summariesGenerated,
  };
}

export async function getBrainSummary(
  factsDb: FactsAppDatabase,
  brainId: string
): Promise<BrainSummaryView | null> {
  const brainSummary = await factsDb
    .selectFrom('brain_summary')
    .where('brainId', '=', brainId)
    .selectAll()
    .executeTakeFirst();

  if (!brainSummary) return null;

  return {
    brainId,
    summary: brainSummary.summary,
    topicHierarchy: JSON.parse(brainSummary.topicHierarchy),
    totalFacts: brainSummary.totalFacts,
    totalTopics: brainSummary.totalTopics,
    averageCoverage: brainSummary.averageCoverage,
    generatedAt: brainSummary.generatedAt,
    version: brainSummary.version,
  };
}

// --- Helpers ---

interface TopicWithFacts {
  id: string;
  brainId: string;
  name: string;
  description: string | null;
  factCount: number;
  coverageScore: number;
  facts: Array<{
    id: string;
    content: string;
    type: string;
    trustScore: number;
  }>;
}

interface ParsedOrganization {
  brainSummary: string;
  topicOrganization: Array<{
    topicId: string;
    parentTopicId: string | null;
    summary: string;
    keyInsights: string[];
  }>;
  newQuestions: Array<{
    topicName: string;
    question: string;
    priority: string;
  }>;
}

function buildOrganizationMessage(topics: TopicWithFacts[]): string {
  const parts: string[] = [];

  parts.push('## Topics and Their Facts\n');

  for (const topic of topics) {
    parts.push(`### Topic: ${topic.name} (id: ${topic.id})`);
    if (topic.description) {
      parts.push(`Description: ${topic.description}`);
    }
    parts.push(`Facts: ${topic.factCount} total, showing top ${topic.facts.length}:`);
    parts.push('');

    for (const fact of topic.facts) {
      parts.push(
        `- [${fact.type}, trust: ${fact.trustScore.toFixed(2)}] ${fact.content}`
      );
    }
    parts.push('');
  }

  parts.push(`\nTotal topics: ${topics.length}`);

  return parts.join('\n');
}

function parseOrganizationResponse(text: string): ParsedOrganization {
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);

  return {
    brainSummary: parsed.brainSummary ?? '',
    topicOrganization: Array.isArray(parsed.topicOrganization)
      ? parsed.topicOrganization
      : [],
    newQuestions: Array.isArray(parsed.newQuestions)
      ? parsed.newQuestions
      : [],
  };
}

function buildHierarchyTree(
  topics: TopicWithFacts[],
  organization: ParsedOrganization['topicOrganization']
): TopicHierarchyNode[] {
  const orgMap = new Map(organization.map((o) => [o.topicId, o]));
  const topicMap = new Map(topics.map((t) => [t.id, t]));

  // Build nodes
  const nodeMap = new Map<string, TopicHierarchyNode>();
  for (const topic of topics) {
    const org = orgMap.get(topic.id);
    nodeMap.set(topic.id, {
      topicId: topic.id,
      name: topic.name,
      description: topic.description ?? '',
      factCount: topic.factCount,
      coverageScore: topic.coverageScore,
      summary: org?.summary ?? '',
      keyInsights: org?.keyInsights ?? [],
      children: [],
    });
  }

  // Assemble tree
  const roots: TopicHierarchyNode[] = [];
  for (const topic of topics) {
    const org = orgMap.get(topic.id);
    const node = nodeMap.get(topic.id)!;
    const parentId = org?.parentTopicId;

    if (parentId && nodeMap.has(parentId)) {
      nodeMap.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
