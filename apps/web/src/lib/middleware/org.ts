import type { RequestInfo } from 'rwsdk/worker';

import { ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { isEffectiveTeamMember } from '@/lib/team-hierarchy';

export function requireOrg({ ctx }: RequestInfo) {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }
  if (!ctx.activeOrganization) {
    throw new UnauthorizedError('No active organization selected');
  }
}

export function requireOrgRole(roles: string[]) {
  return ({ ctx }: RequestInfo) => {
    if (!ctx.user) {
      throw new UnauthorizedError('User is not authenticated');
    }
    if (!ctx.activeOrganization) {
      throw new UnauthorizedError('No active organization selected');
    }
    if (!roles.includes(ctx.activeOrganization.role)) {
      throw new ForbiddenError('Insufficient organization permissions');
    }
  };
}

export function requireTeam({ ctx }: RequestInfo) {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }
  if (!ctx.activeOrganization) {
    throw new UnauthorizedError('No active organization selected');
  }
  if (!ctx.activeTeam) {
    throw new UnauthorizedError('No active team selected');
  }
}

export async function requireTeamMember({ ctx }: RequestInfo) {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }
  if (!ctx.activeTeam) {
    throw new UnauthorizedError('No active team selected');
  }
  const isMember = await isEffectiveTeamMember(ctx.user.id, ctx.activeTeam.id);
  if (!isMember) {
    throw new ForbiddenError('Not a member of the active team');
  }
}
