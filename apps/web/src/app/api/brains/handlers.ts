import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { getFactsDb } from '@/db/facts';
import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  createBrain,
  getBrain,
  listBrainsForTeams,
  updateBrain,
  archiveBrain,
  deleteBrain,
} from '@/lib/services/brain-service';
import { getCachedTeamMemberships } from '@/lib/services/team-membership-cache';

const createBrainSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const updateBrainSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
});

/**
 * Create a brain for the active team.
 */
export async function handleCreateBrain({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = createBrainSchema.parse(body);

  if (!ctx.activeTeam) {
    throw new ValidationError('No active team selected');
  }

  const brain = await createBrain(ctx.factsDb!, env, {
    teamId: ctx.activeTeam.id,
    name: input.name,
    description: input.description,
    userId: ctx.user!.id,
  });

  return Response.json(brain, { status: 201 });
}

/**
 * List all brains accessible to the user in the active org.
 */
export async function handleListBrains({
  ctx,
}: RequestInfo): Promise<Response> {
  const factsDb = ctx.factsDb ?? getFactsDb(ctx.activeOrganization!.id);

  // Get all teams the user is effectively a member of
  const memberships = await getCachedTeamMemberships(
    factsDb,
    ctx.user!.id,
    ctx.activeOrganization!.id
  );

  const teamIds = memberships.map((m) => m.teamId);
  const brains = await listBrainsForTeams(factsDb, teamIds);

  return Response.json(brains);
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
