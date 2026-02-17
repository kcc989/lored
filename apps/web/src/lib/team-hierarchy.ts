import { sql } from 'kysely';

import { db } from '@/db';

/**
 * Get all ancestor teams for a given team (parents up to root).
 * Uses SQLite recursive CTE to walk up the parentTeamId chain.
 */
export async function getTeamAncestors(teamId: string) {
  const result = await sql<{
    id: string;
    name: string;
    organizationId: string;
    parentTeamId: string | null;
    depth: number;
  }>`
    WITH RECURSIVE ancestors AS (
      SELECT id, name, "organizationId", "parentTeamId", 0 as depth
      FROM team
      WHERE id = ${teamId}
      UNION ALL
      SELECT t.id, t.name, t."organizationId", t."parentTeamId", a.depth + 1
      FROM team t
      INNER JOIN ancestors a ON t.id = a."parentTeamId"
    )
    SELECT * FROM ancestors WHERE depth > 0 ORDER BY depth ASC
  `.execute(db);

  return result.rows;
}

/**
 * Get all descendant teams for a given team.
 * Uses SQLite recursive CTE to walk down the parentTeamId chain.
 */
export async function getTeamDescendants(teamId: string) {
  const result = await sql<{
    id: string;
    name: string;
    organizationId: string;
    parentTeamId: string | null;
    depth: number;
  }>`
    WITH RECURSIVE descendants AS (
      SELECT id, name, "organizationId", "parentTeamId", 0 as depth
      FROM team
      WHERE id = ${teamId}
      UNION ALL
      SELECT t.id, t.name, t."organizationId", t."parentTeamId", d.depth + 1
      FROM team t
      INNER JOIN descendants d ON t."parentTeamId" = d.id
    )
    SELECT * FROM descendants WHERE depth > 0 ORDER BY depth ASC
  `.execute(db);

  return result.rows;
}

/**
 * Get all teams a user is effectively a member of within an org.
 * This includes direct team memberships plus all ancestor teams of those direct memberships.
 */
export async function getEffectiveTeamMembership(
  userId: string,
  orgId: string
) {
  const result = await sql<{
    id: string;
    name: string;
    parentTeamId: string | null;
    isDirect: number;
  }>`
    WITH RECURSIVE
    direct_teams AS (
      SELECT t.id, t.name, t."parentTeamId"
      FROM "teamMember" tm
      INNER JOIN team t ON t.id = tm."teamId"
      WHERE tm."userId" = ${userId} AND t."organizationId" = ${orgId}
    ),
    all_teams AS (
      SELECT id, name, "parentTeamId", 1 as "isDirect"
      FROM direct_teams
      UNION
      SELECT t.id, t.name, t."parentTeamId", 0 as "isDirect"
      FROM team t
      INNER JOIN all_teams a ON t.id = a."parentTeamId"
    )
    SELECT DISTINCT id, name, "parentTeamId", MAX("isDirect") as "isDirect"
    FROM all_teams
    GROUP BY id
  `.execute(db);

  return result.rows;
}

/**
 * Check if a user is a direct or inherited member of a specific team.
 * Inherited means: the user is a direct member of any descendant team.
 */
export async function isEffectiveTeamMember(
  userId: string,
  teamId: string
): Promise<boolean> {
  // Check direct membership first (fast path)
  const direct = await db
    .selectFrom('teamMember')
    .where('teamId', '=', teamId)
    .where('userId', '=', userId)
    .selectAll()
    .executeTakeFirst();

  if (direct) return true;

  // Check if user is a member of any descendant team
  const result = await sql<{ found: number }>`
    WITH RECURSIVE descendants AS (
      SELECT id FROM team WHERE id = ${teamId}
      UNION ALL
      SELECT t.id
      FROM team t
      INNER JOIN descendants d ON t."parentTeamId" = d.id
    )
    SELECT EXISTS(
      SELECT 1 FROM "teamMember" tm
      WHERE tm."userId" = ${userId}
      AND tm."teamId" IN (SELECT id FROM descendants)
    ) as found
  `.execute(db);

  return result.rows[0]?.found === 1;
}
