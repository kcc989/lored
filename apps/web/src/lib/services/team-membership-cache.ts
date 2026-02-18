import type { FactsAppDatabase } from '@/db/facts';
import {
  getEffectiveTeamMembership,
  isEffectiveTeamMember,
} from '@/lib/team-hierarchy';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function isFresh(cachedAt: string): boolean {
  return Date.now() - new Date(cachedAt).getTime() < CACHE_TTL_MS;
}

/**
 * Get all teams a user is effectively a member of within the org,
 * using the facts DB cache to avoid repeated recursive CTEs against the auth DB.
 */
export async function getCachedTeamMemberships(
  factsDb: FactsAppDatabase,
  userId: string,
  orgId: string
): Promise<{ teamId: string; isDirect: boolean }[]> {
  // Check cache first
  const cached = await factsDb
    .selectFrom('team_membership_cache')
    .where('userId', '=', userId)
    .selectAll()
    .execute();

  if (cached.length > 0 && cached.every((row) => isFresh(row.cachedAt))) {
    return cached.map((row) => ({
      teamId: row.teamId,
      isDirect: row.isDirect === 1,
    }));
  }

  // Cache miss or stale — resolve from auth DB
  const memberships = await getEffectiveTeamMembership(userId, orgId);

  // Clear stale entries for this user and write fresh cache
  const now = new Date().toISOString();
  await factsDb
    .deleteFrom('team_membership_cache')
    .where('userId', '=', userId)
    .execute();

  if (memberships.length > 0) {
    await factsDb
      .insertInto('team_membership_cache')
      .values(
        memberships.map((m) => ({
          userId,
          teamId: m.id,
          isDirect: m.isDirect,
          cachedAt: now,
        }))
      )
      .execute();
  }

  return memberships.map((m) => ({
    teamId: m.id,
    isDirect: m.isDirect === 1,
  }));
}

/**
 * Check if a user is an effective member of a specific team,
 * using the facts DB cache when available.
 */
export async function isTeamMemberCached(
  factsDb: FactsAppDatabase,
  userId: string,
  teamId: string
): Promise<boolean> {
  // Check cache for this specific team
  const cached = await factsDb
    .selectFrom('team_membership_cache')
    .where('userId', '=', userId)
    .where('teamId', '=', teamId)
    .selectAll()
    .executeTakeFirst();

  if (cached && isFresh(cached.cachedAt)) {
    return true;
  }

  // Cache miss — fall back to auth DB
  const isMember = await isEffectiveTeamMember(userId, teamId);

  if (isMember) {
    // Cache the positive result
    const now = new Date().toISOString();
    await factsDb
      .insertInto('team_membership_cache')
      .values({ userId, teamId, isDirect: 1, cachedAt: now })
      .onConflict((oc) =>
        oc.columns(['userId', 'teamId']).doUpdateSet({ cachedAt: now })
      )
      .execute();
  }

  return isMember;
}

/**
 * Invalidate cached team memberships.
 * Call when team membership changes are detected.
 */
export async function invalidateTeamMembershipCache(
  factsDb: FactsAppDatabase,
  userId?: string
): Promise<void> {
  if (userId) {
    await factsDb
      .deleteFrom('team_membership_cache')
      .where('userId', '=', userId)
      .execute();
  } else {
    // Clear all expired entries
    const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
    await factsDb
      .deleteFrom('team_membership_cache')
      .where('cachedAt', '<', cutoff)
      .execute();
  }
}
