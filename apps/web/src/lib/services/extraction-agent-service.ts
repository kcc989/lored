// --- Types ---

export interface ExtractionInput {
  rawText: string;
  sourceDescription: string;
  sourceType: 'text_input' | 'document_upload' | 'image_upload' | 'google_doc' | 'linear_issue' | 'github_issue' | 'github_pr' | 'github_project';
  existingFacts: Array<{
    id: string;
    content: string;
    type: string;
    trustScore: number;
  }>;
  existingTopics: Array<{
    name: string;
    description: string | null;
  }>;
  imageBase64?: string;
  imageMimeType?: string;
  pdfBase64?: string;
}

export interface ExtractionResult {
  facts: ExtractedFactCandidate[];
  topics: ExtractedTopic[];
  questions: ExtractedQuestion[];
  updates: ExistingFactUpdate[];
  conflicts: DetectedConflict[];
}

export interface ExtractedFactCandidate {
  content: string;
  type:
    | 'general'
    | 'policy'
    | 'procedure'
    | 'definition'
    | 'decision'
    | 'insight';
  confidence: number;
  topics: string[];
  reasoning: string;
}

export interface ExtractedTopic {
  name: string;
  description: string;
  isNew: boolean;
}

export interface ExtractedQuestion {
  topic: string;
  question: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  reasoning: string;
}

export interface ExistingFactUpdate {
  existingFactId: string;
  existingContent: string;
  suggestedContent: string;
  reasoning: string;
  confidence: number;
}

export interface DetectedConflict {
  existingFactId: string;
  existingContent: string;
  newContent: string;
  conflictDescription: string;
}

// --- System Prompt ---

const SYSTEM_PROMPT = `You are a knowledge extraction agent for a product knowledge base. Your job is to decompose raw text into atomic, self-contained facts that can be independently queried and verified.

## Rules for Fact Extraction

1. Each fact must be a single, atomic statement that can stand alone without context.
2. Facts must be stated in present tense, third person, declarative form.
3. Remove hedging language. Use the confidence score to indicate certainty.
4. Classify each fact into exactly one type:
   - general: General product knowledge
   - policy: Business rules, constraints, requirements
   - procedure: How something should be done, processes
   - definition: What something means, terminology
   - decision: A specific choice that was made and why
   - insight: Observations, lessons learned, patterns

5. Assign a confidence score (0.0-1.0) based on how clearly and unambiguously the fact was stated:
   - 0.9-1.0: Explicitly and unambiguously stated
   - 0.7-0.89: Clearly implied with strong evidence
   - 0.5-0.69: Reasonably inferred but some ambiguity
   - Below 0.5: Speculative or weakly implied (still extract but flag)

6. For each fact, identify which topics it belongs to. Reuse existing topics when possible.

7. Compare extracted facts against the existing facts provided. Flag:
   - Updates: new information that supersedes an existing fact
   - Conflicts: new information that contradicts an existing fact
   - Do NOT re-extract facts that merely corroborate existing ones

8. Identify knowledge gaps: topics mentioned where important questions remain unanswered. Generate specific, actionable questions.

## Output Format

Respond with valid JSON matching this exact schema:

{
  "facts": [
    {
      "content": "string - the atomic fact statement",
      "type": "general|policy|procedure|definition|decision|insight",
      "confidence": 0.0-1.0,
      "topics": ["Topic Name"],
      "reasoning": "why this was extracted"
    }
  ],
  "topics": [
    {
      "name": "Topic Name",
      "description": "what this topic covers",
      "isNew": true
    }
  ],
  "questions": [
    {
      "topic": "Topic Name",
      "question": "the specific question",
      "priority": "low|normal|high|critical",
      "reasoning": "why this gap matters"
    }
  ],
  "updates": [
    {
      "existingFactId": "id",
      "existingContent": "current content",
      "suggestedContent": "proposed new content",
      "reasoning": "why the update is needed",
      "confidence": 0.0-1.0
    }
  ],
  "conflicts": [
    {
      "existingFactId": "id",
      "existingContent": "current content",
      "newContent": "conflicting statement",
      "conflictDescription": "nature of the conflict"
    }
  ]
}`;

// --- API Call ---

function buildUserMessage(input: ExtractionInput): string {
  const parts: string[] = [];

  parts.push(`## Source Information`);
  parts.push(`Source: ${input.sourceDescription}`);
  parts.push(`Type: ${input.sourceType}`);
  parts.push('');

  if (input.existingFacts.length > 0) {
    parts.push(`## Existing Facts in This Brain`);
    for (const f of input.existingFacts) {
      parts.push(
        `[${f.id}] (${f.type}, trust: ${f.trustScore.toFixed(2)}): ${f.content}`
      );
    }
    parts.push('');
  }

  if (input.existingTopics.length > 0) {
    parts.push(`## Existing Topics`);
    for (const t of input.existingTopics) {
      parts.push(`- ${t.name}: ${t.description || 'No description'}`);
    }
    parts.push('');
  }

  parts.push(`## Raw Text to Extract From`);
  parts.push(input.rawText);

  return parts.join('\n');
}

type MessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | {
          type: 'image';
          source: { type: 'base64'; media_type: string; data: string };
        }
      | {
          type: 'document';
          source: { type: 'base64'; media_type: 'application/pdf'; data: string };
        }
    >;

function buildMessages(
  input: ExtractionInput
): Array<{ role: 'user'; content: MessageContent }> {
  const textMessage = buildUserMessage(input);

  // Image input: multipart content with image block
  if (input.imageBase64 && input.imageMimeType) {
    return [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: input.imageMimeType,
              data: input.imageBase64,
            },
          },
          { type: 'text', text: textMessage },
        ],
      },
    ];
  }

  // PDF input: document block
  if (input.pdfBase64) {
    return [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: input.pdfBase64,
            },
          },
          { type: 'text', text: textMessage },
        ],
      },
    ];
  }

  // Text input
  return [{ role: 'user', content: textMessage }];
}

/**
 * Call the Anthropic API to extract facts from raw input.
 */
export async function extractFacts(
  env: Env,
  input: ExtractionInput
): Promise<ExtractionResult> {
  const messages = buildMessages(input);

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
      messages,
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

  return parseExtractionResponse(textBlock.text);
}

/**
 * Parse the JSON response from Claude, handling markdown code fences.
 */
function parseExtractionResponse(text: string): ExtractionResult {
  // Strip markdown code fences if present
  let jsonStr = text.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(jsonStr);

  // Validate and provide defaults
  return {
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    topics: Array.isArray(parsed.topics) ? parsed.topics : [],
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    updates: Array.isArray(parsed.updates) ? parsed.updates : [],
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts : [],
  };
}
