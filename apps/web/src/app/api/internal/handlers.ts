import type { RequestInfo } from 'rwsdk/worker';

import { db } from '@/db';

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
