import { nanoid } from 'nanoid';
import { sql } from 'kysely';

import type { FactsAppDatabase } from '@/db/facts';

export async function getOrCreateTopic(
  factsDb: FactsAppDatabase,
  brainId: string,
  name: string,
  description?: string
) {
  const now = new Date().toISOString();
  const normalizedName = name.trim();

  // Try to find existing topic (case-insensitive)
  const existing = await factsDb
    .selectFrom('topic')
    .where('brainId', '=', brainId)
    .where(sql`lower(name)`, '=', normalizedName.toLowerCase())
    .selectAll()
    .executeTakeFirst();

  if (existing) {
    // Update description if provided and current is empty
    if (description && !existing.description) {
      await factsDb
        .updateTable('topic')
        .set({ description, updatedAt: now })
        .where('id', '=', existing.id)
        .execute();
      return { ...existing, description, updatedAt: now };
    }
    return existing;
  }

  const id = nanoid();
  await factsDb
    .insertInto('topic')
    .values({
      id,
      brainId,
      name: normalizedName,
      description: description ?? null,
      factCount: 0,
      coverageScore: 0.0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return factsDb
    .selectFrom('topic')
    .where('id', '=', id)
    .selectAll()
    .executeTakeFirstOrThrow();
}

export async function listTopics(
  factsDb: FactsAppDatabase,
  brainId: string,
  options: { status?: string; page?: number; limit?: number } = {}
) {
  const { status, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  let query = factsDb.selectFrom('topic').where('brainId', '=', brainId);

  if (status) query = query.where('status', '=', status);

  return query
    .selectAll()
    .orderBy('factCount', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();
}

export async function getTopic(factsDb: FactsAppDatabase, topicId: string) {
  const topic = await factsDb
    .selectFrom('topic')
    .where('id', '=', topicId)
    .selectAll()
    .executeTakeFirst();

  if (!topic) return null;

  const [facts, questions] = await Promise.all([
    factsDb
      .selectFrom('topic_fact')
      .innerJoin('fact', 'fact.id', 'topic_fact.factId')
      .where('topic_fact.topicId', '=', topicId)
      .select([
        'fact.id',
        'fact.content',
        'fact.type',
        'fact.status',
        'fact.trustScore',
        'topic_fact.relevance',
      ])
      .orderBy('topic_fact.relevance', 'desc')
      .execute(),
    factsDb
      .selectFrom('topic_question')
      .where('topicId', '=', topicId)
      .selectAll()
      .orderBy('createdAt', 'desc')
      .execute(),
  ]);

  return { ...topic, facts, questions };
}

export async function linkFactToTopic(
  factsDb: FactsAppDatabase,
  topicId: string,
  factId: string,
  relevance: number = 1.0
) {
  const now = new Date().toISOString();

  // Check if link already exists
  const existing = await factsDb
    .selectFrom('topic_fact')
    .where('topicId', '=', topicId)
    .where('factId', '=', factId)
    .selectAll()
    .executeTakeFirst();

  if (existing) return;

  await factsDb
    .insertInto('topic_fact')
    .values({
      id: nanoid(),
      topicId,
      factId,
      relevance,
      createdAt: now,
    })
    .execute();

  // Increment fact count
  await factsDb
    .updateTable('topic')
    .set({
      factCount: sql`factCount + 1`,
      updatedAt: now,
    })
    .where('id', '=', topicId)
    .execute();
}

export async function updateCoverageScore(
  factsDb: FactsAppDatabase,
  topicId: string
): Promise<number> {
  const now = new Date().toISOString();

  // Get facts linked to this topic
  const facts = await factsDb
    .selectFrom('topic_fact')
    .innerJoin('fact', 'fact.id', 'topic_fact.factId')
    .where('topic_fact.topicId', '=', topicId)
    .where('fact.status', 'in', ['active', 'pending_review'])
    .select(['fact.trustScore', 'fact.type'])
    .execute();

  // Get questions for this topic
  const openQuestions = await factsDb
    .selectFrom('topic_question')
    .where('topicId', '=', topicId)
    .where('status', '=', 'open')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const answeredQuestions = await factsDb
    .selectFrom('topic_question')
    .where('topicId', '=', topicId)
    .where('status', '=', 'answered')
    .select(factsDb.fn.countAll().as('count'))
    .executeTakeFirst();

  const factCount = facts.length;
  const openCount = Number(openQuestions?.count ?? 0);
  const answeredCount = Number(answeredQuestions?.count ?? 0);

  // Fact density: more facts = better coverage, diminishing returns
  const densityScore = Math.min(1.0, factCount / 10);

  // Trust quality: average trust of the topic's facts
  const avgTrust =
    factCount > 0
      ? facts.reduce((sum, f) => sum + f.trustScore, 0) / factCount
      : 0;

  // Question resolution ratio
  const totalQuestions = openCount + answeredCount;
  const resolutionScore =
    totalQuestions === 0 ? 0.5 : answeredCount / totalQuestions;

  // Type diversity: having multiple fact types indicates comprehensive coverage
  const types = new Set(facts.map((f) => f.type));
  const diversityScore = Math.min(1.0, types.size / 3);

  const coverageScore =
    densityScore * 0.35 +
    avgTrust * 0.25 +
    resolutionScore * 0.25 +
    diversityScore * 0.15;

  await factsDb
    .updateTable('topic')
    .set({ coverageScore, factCount, updatedAt: now })
    .where('id', '=', topicId)
    .execute();

  return coverageScore;
}
