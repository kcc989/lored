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
