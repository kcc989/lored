import { getOrCreateBrainCollection, deleteBrainCollection } from './client';

export interface FactMetadata {
  factId: string;
  type: string;
  status: string;
  trustScore: number;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Upsert a fact into the brain's ChromaDB collection.
 * Call after the SQLite write succeeds.
 */
export async function syncFactToChroma(
  env: Env,
  brainId: string,
  fact: {
    id: string;
    content: string;
    type: string;
    status: string;
    trustScore: number;
    createdAt: string;
    updatedAt: string;
  },
  tags: string[]
): Promise<void> {
  const collection = await getOrCreateBrainCollection(env, brainId);

  await collection.upsert({
    ids: [fact.id],
    documents: [fact.content],
    metadatas: [
      {
        factId: fact.id,
        type: fact.type,
        status: fact.status,
        trustScore: fact.trustScore,
        tags: tags.join(','),
        createdAt: fact.createdAt,
        updatedAt: fact.updatedAt,
      } satisfies FactMetadata,
    ],
  });
}

/**
 * Remove a fact from the brain's ChromaDB collection.
 */
export async function removeFactFromChroma(
  env: Env,
  brainId: string,
  factId: string
): Promise<void> {
  const collection = await getOrCreateBrainCollection(env, brainId);
  await collection.delete({ ids: [factId] });
}

/**
 * Delete an entire brain's ChromaDB collection.
 * Re-exported from client for convenience.
 */
export { deleteBrainCollection } from './client';
