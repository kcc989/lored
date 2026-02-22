import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { db } from '@/db';
import { getFactsDb } from '@/db/facts';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import {
  createBrain,
  getBrain,
  listBrainsForTeams,
  updateBrain,
  archiveBrain,
  deleteBrain,
} from '@/lib/services/brain-service';
import {
  getCachedTeamMemberships,
  isTeamMemberCached,
} from '@/lib/services/team-membership-cache';

const createBrainSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  teamId: z.string().optional(),
});

const updateBrainSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

/**
 * Create a brain for a specified team or the active team.
 */
export async function handleCreateBrain({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = createBrainSchema.parse(body);

  const teamId = input.teamId ?? ctx.activeTeam?.id;
  if (!teamId) {
    throw new ValidationError('No team specified and no active team selected');
  }

  const factsDb = ctx.factsDb ?? getFactsDb(ctx.activeOrganization!.id);
  const isMember = await isTeamMemberCached(factsDb, ctx.user!.id, teamId);
  if (!isMember) {
    throw new ForbiddenError('Not a member of the specified team');
  }

  const brain = await createBrain(factsDb, env, {
    teamId,
    name: input.name,
    description: input.description,
    userId: ctx.user!.id,
  });

  return Response.json(brain, { status: 201 });
}

/**
 * List all brains accessible to the user in the active org,
 * enriched with team names.
 */
export async function handleListBrains({
  ctx,
}: RequestInfo): Promise<Response> {
  const factsDb = ctx.factsDb ?? getFactsDb(ctx.activeOrganization!.id);

  const memberships = await getCachedTeamMemberships(
    factsDb,
    ctx.user!.id,
    ctx.activeOrganization!.id
  );

  const teamIds = memberships.map((m) => m.teamId);
  const brains = await listBrainsForTeams(factsDb, teamIds);

  // Enrich with team names from central DB
  const uniqueTeamIds = [...new Set(brains.map((b: { teamId: string }) => b.teamId))] as string[];
  let teamNameMap = new Map<string, string>();
  if (uniqueTeamIds.length > 0) {
    const teams = await db
      .selectFrom('team')
      .where('id', 'in', uniqueTeamIds)
      .select(['id', 'name'])
      .execute();
    teamNameMap = new Map(teams.map((t) => [t.id, t.name]));
  }

  const enriched = brains.map((b: { teamId: string; [key: string]: unknown }) => ({
    ...b,
    teamName: teamNameMap.get(b.teamId) ?? 'Unknown Team',
  }));

  return Response.json(enriched);
}

/**
 * Get a single brain by ID.
 */
export async function handleGetBrain({
  ctx,
}: RequestInfo): Promise<Response> {
  const brain = await getBrain(ctx.factsDb!, ctx.activeBrain!.id);

  if (!brain) {
    throw new NotFoundError('Brain not found');
  }

  return Response.json(brain);
}

/**
 * Update a brain's metadata.
 */
export async function handleUpdateBrain({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = updateBrainSchema.parse(body);

  const brain = await updateBrain(ctx.factsDb!, ctx.activeBrain!.id, input);

  return Response.json(brain);
}

/**
 * Delete a brain and its ChromaDB collection.
 */
export async function handleDeleteBrain({
  ctx,
}: RequestInfo): Promise<Response> {
  await deleteBrain(ctx.factsDb!, env, ctx.activeBrain!.id);

  return new Response(null, { status: 204 });
}
