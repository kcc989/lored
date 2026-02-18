import { nanoid } from 'nanoid';

import type { FactsAppDatabase } from '@/db/facts';
import { syncFactToChroma } from '@/lib/chromadb/sync';
import { computeTrustScore } from '@/lib/services/trust-score-service';

/**
 * Recalculate trust score for a fact using all available signals.
 */
function recalculateTrustScore(
  fact: {
    extractionConfidence: number;
    sourceAuthority: number;
    sourceCount: number;
    corroborationCount: number;
    citationCount: number;
    questionCount: number;
    status: string;
  },
  openQuestionCount: number
): number {
  return computeTrustScore({
    extractionConfidence: fact.extractionConfidence ?? 1.0,
    sourceAuthority: fact.sourceAuthority ?? 0.9,
    sourceCount: fact.sourceCount ?? 1,
    corroborationCount: fact.corroborationCount ?? 0,
    citationCount: fact.citationCount,
    openQuestionCount,
    totalQuestionCount: fact.questionCount,
    hasConflict: fact.status === 'conflict',
  });
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

  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', input.factId)
    .selectAll()
    .executeTakeFirstOrThrow();

  const newCitationCount = fact.citationCount + 1;

  const openQuestions = await factsDb
    .selectFrom('fact_question')
    .where('factId', '=', input.factId)
    .where('status', '=', 'open')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const openCount = Number(openQuestions?.count ?? 0);
  const newTrustScore = recalculateTrustScore(
    { ...fact, citationCount: newCitationCount },
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

  const openQuestions = await factsDb
    .selectFrom('fact_question')
    .where('factId', '=', input.factId)
    .where('status', '=', 'open')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const openCount = Number(openQuestions?.count ?? 0);
  const newTrustScore = recalculateTrustScore(
    { ...fact, questionCount: newQuestionCount },
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

  let factStatus = fact.status;
  if (input.newStatus === 'resolved_deprecated') {
    factStatus = 'deprecated';
  } else {
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

  const openQuestions = await factsDb
    .selectFrom('fact_question')
    .where('factId', '=', question.factId)
    .where('status', '=', 'open')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const openCount = Number(openQuestions?.count ?? 0);
  const newTrustScore = recalculateTrustScore(
    { ...fact, status: factStatus },
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
