import {
  ChromaClient,
  Schema,
  VectorIndexConfig,
  SparseVectorIndexConfig,
  K,
} from 'chromadb';
import { JinaEmbeddingFunction } from '@chroma-core/jina';
import { ChromaCloudSpladeEmbeddingFunction } from '@chroma-core/chroma-cloud-splade';

/**
 * Derive a ChromaDB collection name from a brain ID.
 */
export function brainCollectionName(brainId: string): string {
  return `brain_${brainId}`;
}

/**
 * Create a ChromaDB Cloud client.
 */
export function createChromaClient(env: Env): ChromaClient {
  return new ChromaClient({
    path: env.CHROMA_HOST,
    tenant: env.CHROMA_TENANT,
    database: env.CHROMA_DATABASE,
    auth: {
      provider: 'token',
      credentials: env.CHROMA_API_KEY,
    },
  });
}

/**
 * Build the schema for brain collections with both dense (Jina) and sparse (SPLADE) indexes.
 */
export function createBrainSchema(env: Env): Schema {
  const jinaEf = new JinaEmbeddingFunction({
    jinaai_api_key: env.JINA_API_KEY,
    model_name: 'jina-embeddings-v3',
  });

  const spladeEf = new ChromaCloudSpladeEmbeddingFunction({
    apiKeyEnvVar: 'CHROMA_API_KEY',
  });

  return new Schema()
    .createIndex(
      new VectorIndexConfig({
        space: 'cosine',
        embeddingFunction: jinaEf,
      })
    )
    .createIndex(
      new SparseVectorIndexConfig({
        sourceKey: K.DOCUMENT,
        embeddingFunction: spladeEf,
      }),
      'sparse_embedding'
    );
}

/**
 * Get or create the ChromaDB collection for a brain.
 * Schema is only applied on creation; subsequent calls just retrieve the collection.
 */
export async function getOrCreateBrainCollection(
  env: Env,
  brainId: string
) {
  const client = createChromaClient(env);
  const schema = createBrainSchema(env);
  return client.getOrCreateCollection({
    name: brainCollectionName(brainId),
    schema,
  });
}

/**
 * Delete the ChromaDB collection for a brain.
 */
export async function deleteBrainCollection(
  env: Env,
  brainId: string
): Promise<void> {
  const client = createChromaClient(env);
  await client.deleteCollection({ name: brainCollectionName(brainId) });
}
