import { Search, K, Knn, Rrf } from 'chromadb';

import type { FactsAppDatabase } from '@/db/facts';
import { getOrCreateBrainCollection } from '@/lib/chromadb/client';

export interface SearchFactsInput {
  brainId: string;
  queries: string[];
  type?: string;
  status?: string;
  minTrustScore?: number;
  tags?: string[];
  limit?: number;
}

export interface SearchResult {
  factId: string;
  score: number;
  content: string;
  type: string;
  status: string;
  trustScore: number;
  brainId: string;
}

/**
 * Run a single hybrid search query against a brain's ChromaDB collection.
 */
async function searchSingleQuery(
  env: Env,
  brainId: string,
  query: string,
  options: {
    type?: string;
    status?: string;
    minTrustScore?: number;
    limit?: number;
  }
): Promise<Array<{ factId: string; score: number; rank: number }>> {
  const collection = await getOrCreateBrainCollection(env, brainId);
  const candidateLimit = 200;

  const hybridRank = Rrf({
    ranks: [
      Knn({ query, returnRank: true, limit: candidateLimit }),
      Knn({
        query,
        key: 'sparse_embedding',
        returnRank: true,
        limit: candidateLimit,
      }),
    ],
    weights: [0.7, 0.3],
    k: 60,
  });

  let search = new Search()
    .rank(hybridRank)
    .limit(options.limit ?? 20)
    .select(K.DOCUMENT, K.SCORE, 'factId', 'type', 'status', 'trustScore');

  // Build where clause from filters
  let whereClause = null;
  if (options.status) {
    whereClause = K('status').eq(options.status);
  }
  if (options.type) {
    const typeFilter = K('type').eq(options.type);
    whereClause = whereClause ? whereClause.and(typeFilter) : typeFilter;
  }
  if (options.minTrustScore !== undefined) {
    const trustFilter = K('trustScore').gte(options.minTrustScore);
    whereClause = whereClause ? whereClause.and(trustFilter) : trustFilter;
  }
  if (whereClause) {
    search = search.where(whereClause);
  }

  const results = await collection.search(search);
  const rows = results.rows()[0] ?? [];

  return rows.map((row, index) => ({
    factId: (row.metadata?.factId as string) ?? row.id,
    score: row.score ?? 0,
    rank: index + 1,
  }));
}

/**
 * Merge results from multiple queries using cross-query RRF.
 * Facts appearing across multiple queries rank higher.
 */
function mergeQueryResults(
  queryResults: Array<Array<{ factId: string; score: number; rank: number }>>,
  k: number = 60
): Array<{ factId: string; score: number }> {
  const merged = new Map<string, number>();

  for (const results of queryResults) {
    for (const result of results) {
      const existing = merged.get(result.factId) ?? 0;
      merged.set(result.factId, existing + 1 / (k + result.rank));
    }
  }

  return Array.from(merged.entries())
    .map(([factId, score]) => ({ factId, score }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Search facts within a brain using multiple queries with hybrid search.
 * Runs each query in parallel, then merges via cross-query RRF.
 */
export async function searchFacts(
  env: Env,
  factsDb: FactsAppDatabase,
  input: SearchFactsInput
): Promise<SearchResult[]> {
  const limit = input.limit ?? 20;

  // Run all queries in parallel
  const queryResults = await Promise.all(
    input.queries.map((query) =>
      searchSingleQuery(env, input.brainId, query, {
        type: input.type,
        status: input.status,
        minTrustScore: input.minTrustScore,
        limit: limit * 2, // fetch extra per query for better merging
      })
    )
  );

  // Merge results across queries
  const merged = mergeQueryResults(queryResults);
  const topFactIds = merged.slice(0, limit).map((r) => r.factId);

  if (topFactIds.length === 0) return [];

  // Hydrate from SQLite
  const facts = await factsDb
    .selectFrom('fact')
    .where('id', 'in', topFactIds)
    .selectAll()
    .execute();

  // Build a score map for ordering
  const scoreMap = new Map(merged.map((r) => [r.factId, r.score]));

  return facts
    .map((fact) => ({
      factId: fact.id,
      score: scoreMap.get(fact.id) ?? 0,
      content: fact.content,
      type: fact.type,
      status: fact.status,
      trustScore: fact.trustScore,
      brainId: fact.brainId,
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Search facts across multiple brains.
 * Each brain is searched independently, results merged via cross-query RRF.
 */
export async function searchFactsAcrossBrains(
  env: Env,
  factsDb: FactsAppDatabase,
  input: {
    brainIds: string[];
    queries: string[];
    type?: string;
    status?: string;
    minTrustScore?: number;
    limit?: number;
  }
): Promise<SearchResult[]> {
  const limit = input.limit ?? 20;

  // Run all queries against all brains in parallel
  const allQueryResults = await Promise.all(
    input.brainIds.flatMap((brainId) =>
      input.queries.map((query) =>
        searchSingleQuery(env, brainId, query, {
          type: input.type,
          status: input.status,
          minTrustScore: input.minTrustScore,
          limit: limit * 2,
        })
      )
    )
  );

  // Merge all results
  const merged = mergeQueryResults(allQueryResults);
  const topFactIds = merged.slice(0, limit).map((r) => r.factId);

  if (topFactIds.length === 0) return [];

  // Hydrate from SQLite
  const facts = await factsDb
    .selectFrom('fact')
    .where('id', 'in', topFactIds)
    .selectAll()
    .execute();

  const scoreMap = new Map(merged.map((r) => [r.factId, r.score]));

  return facts
    .map((fact) => ({
      factId: fact.id,
      score: scoreMap.get(fact.id) ?? 0,
      content: fact.content,
      type: fact.type,
      status: fact.status,
      trustScore: fact.trustScore,
      brainId: fact.brainId,
    }))
    .sort((a, b) => b.score - a.score);
}
