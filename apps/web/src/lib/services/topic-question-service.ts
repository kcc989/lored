import { nanoid } from 'nanoid';

import type { FactsAppDatabase } from '@/db/facts';
import { createFact } from '@/lib/services/fact-service';
import { linkFactToTopic, updateCoverageScore } from '@/lib/services/topic-service';

export async function createTopicQuestion(
  factsDb: FactsAppDatabase,
  input: {
    topicId: string;
    brainId: string;
    question: string;
    priority?: 'low' | 'normal' | 'high' | 'critical';
  }
) {
  const now = new Date().toISOString();
  const id = nanoid();

  await factsDb
    .insertInto('topic_question')
    .values({
      id,
      topicId: input.topicId,
      brainId: input.brainId,
      question: input.question,
      priority: input.priority ?? 'normal',
      status: 'open',
      answer: null,
      answeredBy: null,
      answeredAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .execute();

  return factsDb
    .selectFrom('topic_question')
    .where('id', '=', id)
    .selectAll()
    .executeTakeFirstOrThrow();
}

export async function answerTopicQuestion(
  factsDb: FactsAppDatabase,
  env: Env,
  input: {
    questionId: string;
    answer: string;
    answeredBy: string;
    createFactFromAnswer: boolean;
    brainId: string;
  }
) {
  const now = new Date().toISOString();

  // Update the question
  await factsDb
    .updateTable('topic_question')
    .set({
      answer: input.answer,
      answeredBy: input.answeredBy,
      answeredAt: now,
      status: 'answered',
      updatedAt: now,
    })
    .where('id', '=', input.questionId)
    .execute();

  const question = await factsDb
    .selectFrom('topic_question')
    .where('id', '=', input.questionId)
    .selectAll()
    .executeTakeFirstOrThrow();

  let fact = null;

  // Optionally create a fact from the answer
  if (input.createFactFromAnswer) {
    fact = await createFact(factsDb, env, {
      brainId: input.brainId,
      content: input.answer,
      type: 'general',
      sourceAuthority: 0.9, // Direct human entry
      extractionConfidence: 1.0,
      userId: input.answeredBy,
      sources: [
        {
          sourceType: 'person',
          userId: input.answeredBy,
          description: `Answer to: ${question.question}`,
        },
      ],
    });

    // Link the fact to the question's topic
    if (fact) {
      await linkFactToTopic(factsDb, question.topicId, fact.id);
      await updateCoverageScore(factsDb, question.topicId);
    }
  } else {
    // Still update coverage even without creating a fact
    await updateCoverageScore(factsDb, question.topicId);
  }

  return { question, fact };
}

export async function listTopicQuestions(
  factsDb: FactsAppDatabase,
  brainId: string,
  options: {
    topicId?: string;
    status?: string;
    priority?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const { topicId, status, priority, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  let query = factsDb
    .selectFrom('topic_question')
    .where('brainId', '=', brainId);

  if (topicId) query = query.where('topicId', '=', topicId);
  if (status) query = query.where('status', '=', status);
  if (priority) query = query.where('priority', '=', priority);

  return query
    .selectAll()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();
}

export async function dismissTopicQuestion(
  factsDb: FactsAppDatabase,
  questionId: string
) {
  const now = new Date().toISOString();

  await factsDb
    .updateTable('topic_question')
    .set({ status: 'dismissed', updatedAt: now })
    .where('id', '=', questionId)
    .execute();

  // Get the question to update coverage
  const question = await factsDb
    .selectFrom('topic_question')
    .where('id', '=', questionId)
    .select('topicId')
    .executeTakeFirst();

  if (question) {
    await updateCoverageScore(factsDb, question.topicId);
  }
}
