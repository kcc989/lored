import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { db } from '@/db';
import { getFactsDb } from '@/db/facts';
import { getBrain } from '@/lib/services/brain-service';
import { getCachedTeamMemberships } from '@/lib/services/team-membership-cache';
import { searchFacts } from '@/lib/services/fact-search-service';

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
