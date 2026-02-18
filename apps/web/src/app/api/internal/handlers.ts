import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { db } from '@/db';
import { getFactsDb } from '@/db/facts';
import { getBrain } from '@/lib/services/brain-service';
import { getCachedTeamMemberships } from '@/lib/services/team-membership-cache';
import { searchFacts } from '@/lib/services/fact-search-service';
import { ingestText } from '@/lib/services/ingestion-service';
import { listTopics } from '@/lib/services/topic-service';
import {
  listTopicQuestions,
  answerTopicQuestion,
} from '@/lib/services/topic-question-service';

/**
 * Look up a lored user by their GitHub account ID.
 * Used by the MCP server via service binding to validate
 * that a GitHub-authenticated user has a lored account.
 */
export async function getUserByGitHubAccount({
  params,
}: RequestInfo): Promise<Response> {
  const accountId = params.accountId;
  if (!accountId) {
    return Response.json({ error: 'Missing accountId' }, { status: 400 });
  }

  const result = await db
    .selectFrom('account')
    .innerJoin('user', 'user.id', 'account.userId')
    .where('account.providerId', '=', 'github')
    .where('account.accountId', '=', accountId)
    .select([
      'user.id',
      'user.email',
      'user.name',
      'user.image',
      'user.username',
    ])
    .executeTakeFirst();

  if (!result) {
    return Response.json({ error: 'User not found' }, { status: 404 });
  }

  return Response.json({
    id: result.id,
    email: result.email,
    name: result.name,
    image: result.image,
    username: result.username,
  });
}

/**
 * Look up a user's organizations and teams.
 * Used by the MCP server via service binding to include
 * org/team context in the MCP token props.
 */
export async function getUserOrganizations({
  params,
}: RequestInfo): Promise<Response> {
  const userId = params.userId;
  if (!userId) {
    return Response.json({ error: 'Missing userId' }, { status: 400 });
  }

  const memberships = await db
    .selectFrom('member')
    .innerJoin('organization', 'organization.id', 'member.organizationId')
    .where('member.userId', '=', userId)
    .select([
      'organization.id',
      'organization.name',
      'organization.slug',
      'member.role',
    ])
    .execute();

  const result = await Promise.all(
    memberships.map(async (m) => {
      const teams = await db
        .selectFrom('teamMember')
        .innerJoin('team', 'team.id', 'teamMember.teamId')
        .where('teamMember.userId', '=', userId)
        .where('team.organizationId', '=', m.id)
        .select(['team.id', 'team.name', 'team.parentTeamId'])
        .execute();

      return {
        org: { id: m.id, name: m.name, slug: m.slug },
        role: m.role,
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          parentTeamId: t.parentTeamId ?? null,
        })),
      };
    })
  );

  return Response.json(result);
}

// --- Search ---

const internalSearchSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  brainId: z.string().min(1),
  queries: z.array(z.string().min(1)).min(1),
  type: z.enum(['general', 'policy', 'procedure', 'definition', 'decision', 'insight']).optional(),
  status: z.string().optional(),
  minTrustScore: z.number().min(0).max(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

/**
 * Search facts within a single brain.
 * Used by the MCP server via service binding.
 * Validates the user has access to the brain's team before searching.
 */
export async function searchBrainInternal({
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = internalSearchSchema.parse(body);

  const factsDb = getFactsDb(input.organizationId);

  // Verify the brain exists and get its team
  const brain = await getBrain(factsDb, input.brainId);
  if (!brain) {
    return Response.json({ error: 'Brain not found' }, { status: 404 });
  }

  // Verify the user has access via team membership
  const memberships = await getCachedTeamMemberships(
    factsDb,
    input.userId,
    input.organizationId,
  );
  const teamIds = new Set(memberships.map((m) => m.teamId));
  if (!teamIds.has(brain.teamId)) {
    return Response.json({ error: 'Access denied' }, { status: 403 });
  }

  const results = await searchFacts(env, factsDb, {
    brainId: input.brainId,
    queries: input.queries,
    type: input.type,
    status: input.status,
    minTrustScore: input.minTrustScore,
    limit: input.limit,
  });

  return Response.json(results);
}

// --- Ingestion (internal, for MCP) ---

/**
 * Validate user has access to a brain. Shared by internal ingestion endpoints.
 */
async function validateBrainAccess(userId: string, organizationId: string, brainId: string) {
  const factsDb = getFactsDb(organizationId);
  const brain = await getBrain(factsDb, brainId);
  if (!brain) return { error: 'Brain not found', status: 404 as const, factsDb, brain: null };

  const memberships = await getCachedTeamMemberships(factsDb, userId, organizationId);
  const teamIds = new Set(memberships.map((m) => m.teamId));
  if (!teamIds.has(brain.teamId)) return { error: 'Access denied', status: 403 as const, factsDb, brain: null };

  return { error: null, status: 200 as const, factsDb, brain };
}

const internalIngestTextSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  brainId: z.string().min(1),
  text: z.string().min(1),
  title: z.string().optional(),
});

export async function ingestTextInternal({
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = internalIngestTextSchema.parse(body);

  const { error, status, factsDb } = await validateBrainAccess(
    input.userId,
    input.organizationId,
    input.brainId,
  );
  if (error) return Response.json({ error }, { status });

  const result = await ingestText(factsDb, env, {
    brainId: input.brainId,
    text: input.text,
    title: input.title,
    userId: input.userId,
  });

  return Response.json(result, { status: 201 });
}

// --- Topics (internal, for MCP) ---

const internalBrainSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  brainId: z.string().min(1),
});

export async function listTopicsInternal({
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = internalBrainSchema.parse(body);

  const { error, status, factsDb } = await validateBrainAccess(
    input.userId,
    input.organizationId,
    input.brainId,
  );
  if (error) return Response.json({ error }, { status });

  const topics = await listTopics(factsDb, input.brainId);
  return Response.json(topics);
}

// --- Questions (internal, for MCP) ---

const internalQuestionsSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  brainId: z.string().min(1),
  topicId: z.string().optional(),
  status: z.enum(['open', 'answered', 'dismissed']).optional(),
});

export async function listQuestionsInternal({
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = internalQuestionsSchema.parse(body);

  const { error, status, factsDb } = await validateBrainAccess(
    input.userId,
    input.organizationId,
    input.brainId,
  );
  if (error) return Response.json({ error }, { status });

  const questions = await listTopicQuestions(factsDb, input.brainId, {
    topicId: input.topicId,
    status: input.status,
  });
  return Response.json(questions);
}

const internalAnswerSchema = z.object({
  userId: z.string().min(1),
  organizationId: z.string().min(1),
  brainId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.string().min(1),
  createFact: z.boolean().optional().default(true),
});

export async function answerQuestionInternal({
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = internalAnswerSchema.parse(body);

  const { error, status, factsDb } = await validateBrainAccess(
    input.userId,
    input.organizationId,
    input.brainId,
  );
  if (error) return Response.json({ error }, { status });

  const result = await answerTopicQuestion(factsDb, env, {
    questionId: input.questionId,
    answer: input.answer,
    answeredBy: input.userId,
    createFactFromAnswer: input.createFact,
    brainId: input.brainId,
  });

  return Response.json(result);
}
