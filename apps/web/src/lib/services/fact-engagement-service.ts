import { nanoid } from 'nanoid';

import type { FactsAppDatabase } from '@/db/facts';
import { syncFactToChroma } from '@/lib/chromadb/sync';

/**
 * Calculate trust score based on citations and questions.
 * Base 0.5, boosted by citations (max +0.3), penalized by open questions.
 */
function calculateTrustScore(
  citationCount: number,
  questionCount: number,
  openQuestionCount: number
): number {
  const base = 0.5;
  const citationBoost = Math.min(citationCount * 0.02, 0.3);
  const openPenalty = openQuestionCount * 0.1;
  const resolvedPenalty = (questionCount - openQuestionCount) * 0.02;
  return Math.max(0, Math.min(1, base + citationBoost - openPenalty - resolvedPenalty));
}

/**
 * Record an explicit citation of a fact by a user or agent.
 * Increments citationCount and recalculates trustScore.
 */
export async function recordCitation(
  factsDb: FactsAppDatabase,
  env: Env,
  input: {
    factId: string;
    citedBy: string;
    citationContext?: string;
    sourceType?: 'user' | 'agent';
  }
) {
  const now = new Date().toISOString();

  await factsDb
    .insertInto('fact_citation')
    .values({
      id: nanoid(),
      factId: input.factId,
      citedBy: input.citedBy,
      citationContext: input.citationContext ?? null,
      sourceType: input.sourceType ?? 'user',
      createdAt: now,
    })
    .execute();

  // Increment citation count
  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', input.factId)
    .selectAll()
    .executeTakeFirstOrThrow();

  const newCitationCount = fact.citationCount + 1;

  // Count open questions
  const openQuestions = await factsDb
    .selectFrom('fact_question')
    .where('factId', '=', input.factId)
    .where('status', '=', 'open')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const openCount = Number(openQuestions?.count ?? 0);
  const newTrustScore = calculateTrustScore(
    newCitationCount,
    fact.questionCount,
    openCount
  );

  await factsDb
    .updateTable('fact')
    .set({
      citationCount: newCitationCount,
      trustScore: newTrustScore,
      updatedAt: now,
    })
    .where('id', '=', input.factId)
    .execute();

  // Sync updated trust score to ChromaDB
  const tags = await factsDb
    .selectFrom('fact_tag')
    .where('factId', '=', input.factId)
    .select('tagValue')
    .execute();

  await syncFactToChroma(
    env,
    fact.brainId,
    {
      id: fact.id,
      content: fact.content,
      type: fact.type,
      status: fact.status,
      trustScore: newTrustScore,
      createdAt: fact.createdAt,
      updatedAt: now,
    },
    tags.map((t) => t.tagValue)
  );
}

/**
 * Question a fact's accuracy. Sets fact status to 'questioned',
 * increments questionCount, and recalculates trustScore.
 */
export async function questionFact(
  factsDb: FactsAppDatabase,
  env: Env,
  input: {
    factId: string;
    questionedBy: string;
    reason: string;
  }
) {
  const now = new Date().toISOString();

  await factsDb
    .insertInto('fact_question')
    .values({
      id: nanoid(),
      factId: input.factId,
      questionedBy: input.questionedBy,
      reason: input.reason,
      status: 'open',
      resolution: null,
      resolvedBy: null,
      resolvedAt: null,
      createdAt: now,
    })
    .execute();

  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', input.factId)
    .selectAll()
    .executeTakeFirstOrThrow();

  const newQuestionCount = fact.questionCount + 1;

  // Count open questions (including the one we just inserted)
  const openQuestions = await factsDb
    .selectFrom('fact_question')
    .where('factId', '=', input.factId)
    .where('status', '=', 'open')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const openCount = Number(openQuestions?.count ?? 0);
  const newTrustScore = calculateTrustScore(
    fact.citationCount,
    newQuestionCount,
    openCount
  );

  await factsDb
    .updateTable('fact')
    .set({
      status: 'questioned',
      questionCount: newQuestionCount,
      trustScore: newTrustScore,
      updatedAt: now,
    })
    .where('id', '=', input.factId)
    .execute();

  // Sync to ChromaDB
  const tags = await factsDb
    .selectFrom('fact_tag')
    .where('factId', '=', input.factId)
    .select('tagValue')
    .execute();

  await syncFactToChroma(
    env,
    fact.brainId,
    {
      id: fact.id,
      content: fact.content,
      type: fact.type,
      status: 'questioned',
      trustScore: newTrustScore,
      createdAt: fact.createdAt,
      updatedAt: now,
    },
    tags.map((t) => t.tagValue)
  );
}

/**
 * Resolve a question on a fact.
 */
export async function resolveQuestion(
  factsDb: FactsAppDatabase,
  env: Env,
  input: {
    questionId: string;
    resolvedBy: string;
    resolution: string;
    newStatus: 'resolved_valid' | 'resolved_updated' | 'resolved_deprecated';
  }
) {
  const now = new Date().toISOString();

  // Update the question
  await factsDb
    .updateTable('fact_question')
    .set({
      status: input.newStatus,
      resolution: input.resolution,
      resolvedBy: input.resolvedBy,
      resolvedAt: now,
    })
    .where('id', '=', input.questionId)
    .execute();

  // Get the question to find the factId
  const question = await factsDb
    .selectFrom('fact_question')
    .where('id', '=', input.questionId)
    .select('factId')
    .executeTakeFirstOrThrow();

  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', question.factId)
    .selectAll()
    .executeTakeFirstOrThrow();

  // Determine new fact status based on resolution
  let factStatus = fact.status;
  if (input.newStatus === 'resolved_deprecated') {
    factStatus = 'deprecated';
  } else {
    // Check if there are still open questions
    const remaining = await factsDb
      .selectFrom('fact_question')
      .where('factId', '=', question.factId)
      .where('status', '=', 'open')
      .select(factsDb.fn.countAll().as('count'))
      .executeTakeFirst();

    if (Number(remaining?.count ?? 0) === 0) {
      factStatus = 'active';
    }
  }

  // Recalculate trust score
  const openQuestions = await factsDb
    .selectFrom('fact_question')
    .where('factId', '=', question.factId)
    .where('status', '=', 'open')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const openCount = Number(openQuestions?.count ?? 0);
  const newTrustScore = calculateTrustScore(
    fact.citationCount,
    fact.questionCount,
    openCount
  );

  await factsDb
    .updateTable('fact')
    .set({
      status: factStatus,
      trustScore: newTrustScore,
      updatedAt: now,
    })
    .where('id', '=', question.factId)
    .execute();

  // Sync to ChromaDB
  const tags = await factsDb
    .selectFrom('fact_tag')
    .where('factId', '=', question.factId)
    .select('tagValue')
    .execute();

  await syncFactToChroma(
    env,
    fact.brainId,
    {
      id: fact.id,
      content: fact.content,
      type: fact.type,
      status: factStatus,
      trustScore: newTrustScore,
      createdAt: fact.createdAt,
      updatedAt: now,
    },
    tags.map((t) => t.tagValue)
  );
}
