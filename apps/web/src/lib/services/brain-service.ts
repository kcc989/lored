import { nanoid } from 'nanoid';

import type { FactsAppDatabase } from '@/db/facts';
import {
  getOrCreateBrainCollection,
  deleteBrainCollection,
} from '@/lib/chromadb/client';

export interface CreateBrainInput {
  teamId: string;
  name: string;
  description?: string;
  userId: string;
}

export interface UpdateBrainInput {
  name?: string;
  description?: string;
}

export async function createBrain(
  factsDb: FactsAppDatabase,
  env: Env,
  input: CreateBrainInput
) {
  const now = new Date().toISOString();
  const id = nanoid();

  await factsDb
    .insertInto('brain')
    .values({
      id,
      teamId: input.teamId,
      name: input.name,
      description: input.description ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: input.userId,
    })
    .execute();

  // Create the ChromaDB collection for this brain
  await getOrCreateBrainCollection(env, id);

  return getBrain(factsDb, id);
}

export async function getBrain(factsDb: FactsAppDatabase, brainId: string) {
  return factsDb
    .selectFrom('brain')
    .where('id', '=', brainId)
    .selectAll()
    .executeTakeFirst();
}

export async function listBrainsForTeams(
  factsDb: FactsAppDatabase,
  teamIds: string[]
) {
  if (teamIds.length === 0) return [];

  return factsDb
    .selectFrom('brain')
    .where('teamId', 'in', teamIds)
    .where('status', '=', 'active')
    .selectAll()
    .orderBy('createdAt', 'desc')
    .execute();
}

export async function updateBrain(
  factsDb: FactsAppDatabase,
  brainId: string,
  input: UpdateBrainInput
) {
  const updates: Record<string, string> = {
    updatedAt: new Date().toISOString(),
  };

  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;

  await factsDb
    .updateTable('brain')
    .set(updates)
    .where('id', '=', brainId)
    .execute();

  return getBrain(factsDb, brainId);
}

export async function archiveBrain(
  factsDb: FactsAppDatabase,
  brainId: string
) {
  await factsDb
    .updateTable('brain')
    .set({
      status: 'archived',
      updatedAt: new Date().toISOString(),
    })
    .where('id', '=', brainId)
    .execute();
}

export async function deleteBrain(
  factsDb: FactsAppDatabase,
  env: Env,
  brainId: string
) {
  // Delete from SQLite (cascades to facts and related tables)
  await factsDb.deleteFrom('brain').where('id', '=', brainId).execute();

  // Delete the ChromaDB collection
  await deleteBrainCollection(env, brainId);
}
