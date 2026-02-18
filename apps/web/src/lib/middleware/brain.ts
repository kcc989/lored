import type { RequestInfo } from 'rwsdk/worker';

import { getFactsDb } from '@/db/facts';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '@/lib/errors';
import { isTeamMemberCached } from '@/lib/services/team-membership-cache';

/**
 * Middleware that resolves the org-scoped facts DB and puts it on context.
 * Requires an active organization.
 */
export function requireFactsDb({ ctx }: RequestInfo) {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }
  if (!ctx.activeOrganization) {
    throw new UnauthorizedError('No active organization selected');
  }

  ctx.factsDb = getFactsDb(ctx.activeOrganization.id);
}

/**
 * Middleware that loads a brain by params.brainId and verifies the user
 * has access via team membership. Sets ctx.activeBrain and ctx.factsDb.
 *
 * No org cross-check needed — the DB instance is already org-scoped.
 * If the brain doesn't exist in this org's DB, it's simply not found.
 */
export async function requireBrainAccess({ ctx, params }: RequestInfo) {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }
  if (!ctx.activeOrganization) {
    throw new UnauthorizedError('No active organization selected');
  }

  const factsDb = ctx.factsDb ?? getFactsDb(ctx.activeOrganization.id);
  ctx.factsDb = factsDb;

  const brain = await factsDb
    .selectFrom('brain')
    .where('id', '=', params.brainId)
    .selectAll()
    .executeTakeFirst();

  if (!brain) {
    throw new NotFoundError('Brain not found');
  }

  if (brain.status === 'archived') {
    throw new NotFoundError('Brain has been archived');
  }

  const hasAccess = await isTeamMemberCached(
    factsDb,
    ctx.user.id,
    brain.teamId
  );

  if (!hasAccess) {
    throw new ForbiddenError('Not a member of this brain\'s team');
  }

  ctx.activeBrain = {
    id: brain.id,
    name: brain.name,
    teamId: brain.teamId,
    status: brain.status,
  };
}
