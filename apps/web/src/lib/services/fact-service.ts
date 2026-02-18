import { nanoid } from 'nanoid';

import type { FactsAppDatabase } from '@/db/facts';
import { syncFactToChroma, removeFactFromChroma } from '@/lib/chromadb/sync';

export interface CreateFactInput {
  brainId: string;
  content: string;
  type?: string;
  sources?: Array<{
    sourceType: 'document' | 'link' | 'person';
    title?: string;
    url?: string;
    userId?: string;
    description?: string;
  }>;
  tags?: Array<{
    tagType?: 'text' | 'external_id';
    tagValue: string;
    tagNamespace?: string;
  }>;
  userId: string;
}

export interface UpdateFactInput {
  factId: string;
  content?: string;
  type?: string;
  changeReason?: string;
  userId: string;
}

export async function createFact(
  factsDb: FactsAppDatabase,
  env: Env,
  input: CreateFactInput
) {
  const now = new Date().toISOString();
  const factId = nanoid();
  const versionId = nanoid();
  const type = input.type ?? 'general';

  // Insert fact
  await factsDb
    .insertInto('fact')
    .values({
      id: factId,
      brainId: input.brainId,
      content: input.content,
      type,
      status: 'active',
      trustScore: 0.5,
      citationCount: 0,
      questionCount: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: input.userId,
    })
    .execute();

  // Insert initial version
  await factsDb
    .insertInto('fact_version')
    .values({
      id: versionId,
      factId,
      version: 1,
      content: input.content,
      type,
      changeReason: null,
      changedBy: input.userId,
      createdAt: now,
    })
    .execute();

  // Insert sources
  const tagValues: string[] = [];
  if (input.sources && input.sources.length > 0) {
    await factsDb
      .insertInto('fact_source')
      .values(
        input.sources.map((s) => ({
          id: nanoid(),
          factId,
          sourceType: s.sourceType,
          title: s.title ?? null,
          url: s.url ?? null,
          userId: s.userId ?? null,
          description: s.description ?? null,
          createdAt: now,
          createdBy: input.userId,
        }))
      )
      .execute();
  }

  // Insert tags
  if (input.tags && input.tags.length > 0) {
    await factsDb
      .insertInto('fact_tag')
      .values(
        input.tags.map((t) => ({
          id: nanoid(),
          factId,
          tagType: t.tagType ?? 'text',
          tagValue: t.tagValue,
          tagNamespace: t.tagNamespace ?? null,
          createdAt: now,
          createdBy: input.userId,
        }))
      )
      .execute();
    tagValues.push(...input.tags.map((t) => t.tagValue));
  }

  // Sync to ChromaDB
  await syncFactToChroma(
    env,
    input.brainId,
    {
      id: factId,
      content: input.content,
      type,
      status: 'active',
      trustScore: 0.5,
      createdAt: now,
      updatedAt: now,
    },
    tagValues
  );

  return getFact(factsDb, factId);
}

export async function updateFact(
  factsDb: FactsAppDatabase,
  env: Env,
  input: UpdateFactInput
) {
  const now = new Date().toISOString();

  // Get existing fact
  const existing = await factsDb
    .selectFrom('fact')
    .where('id', '=', input.factId)
    .selectAll()
    .executeTakeFirstOrThrow();

  const newContent = input.content ?? existing.content;
  const newType = input.type ?? existing.type;

  // Get the latest version number
  const latestVersion = await factsDb
    .selectFrom('fact_version')
    .where('factId', '=', input.factId)
    .select(factsDb.fn.max('version').as('maxVersion'))
    .executeTakeFirst();

  const nextVersion = ((latestVersion?.maxVersion as number) ?? 0) + 1;

  // Insert new version
  await factsDb
    .insertInto('fact_version')
    .values({
      id: nanoid(),
      factId: input.factId,
      version: nextVersion,
      content: newContent,
      type: newType,
      changeReason: input.changeReason ?? null,
      changedBy: input.userId,
      createdAt: now,
    })
    .execute();

  // Update fact row
  await factsDb
    .updateTable('fact')
    .set({
      content: newContent,
      type: newType,
      updatedAt: now,
    })
    .where('id', '=', input.factId)
    .execute();

  // Get tags for ChromaDB sync
  const tags = await factsDb
    .selectFrom('fact_tag')
    .where('factId', '=', input.factId)
    .select('tagValue')
    .execute();

  // Re-sync to ChromaDB
  await syncFactToChroma(
    env,
    existing.brainId,
    {
      id: input.factId,
      content: newContent,
      type: newType,
      status: existing.status,
      trustScore: existing.trustScore,
      createdAt: existing.createdAt,
      updatedAt: now,
    },
    tags.map((t) => t.tagValue)
  );

  return getFact(factsDb, input.factId);
}

export async function getFact(factsDb: FactsAppDatabase, factId: string) {
  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', factId)
    .selectAll()
    .executeTakeFirst();

  if (!fact) return null;

  const [sources, tags, versions] = await Promise.all([
    factsDb
      .selectFrom('fact_source')
      .where('factId', '=', factId)
      .selectAll()
      .execute(),
    factsDb
      .selectFrom('fact_tag')
      .where('factId', '=', factId)
      .selectAll()
      .execute(),
    factsDb
      .selectFrom('fact_version')
      .where('factId', '=', factId)
      .selectAll()
      .orderBy('version', 'desc')
      .execute(),
  ]);

  return { ...fact, sources, tags, versions };
}

export async function listFacts(
  factsDb: FactsAppDatabase,
  brainId: string,
  options: {
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}
) {
  const { type, status, page = 1, limit = 50 } = options;
  const offset = (page - 1) * limit;

  let query = factsDb
    .selectFrom('fact')
    .where('brainId', '=', brainId);

  if (type) query = query.where('type', '=', type);
  if (status) query = query.where('status', '=', status);

  const facts = await query
    .selectAll()
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  return facts;
}

export async function deleteFact(
  factsDb: FactsAppDatabase,
  env: Env,
  factId: string
) {
  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', factId)
    .select(['brainId'])
    .executeTakeFirst();

  if (!fact) return;

  // Delete from SQLite (cascades to versions, sources, tags, citations, questions)
  await factsDb.deleteFrom('fact').where('id', '=', factId).execute();

  // Remove from ChromaDB
  await removeFactFromChroma(env, fact.brainId, factId);
}

export async function addSource(
  factsDb: FactsAppDatabase,
  factId: string,
  source: {
    sourceType: 'document' | 'link' | 'person';
    title?: string;
    url?: string;
    userId?: string;
    description?: string;
  },
  createdBy: string
) {
  const id = nanoid();
  await factsDb
    .insertInto('fact_source')
    .values({
      id,
      factId,
      sourceType: source.sourceType,
      title: source.title ?? null,
      url: source.url ?? null,
      userId: source.userId ?? null,
      description: source.description ?? null,
      createdAt: new Date().toISOString(),
      createdBy,
    })
    .execute();

  return factsDb
    .selectFrom('fact_source')
    .where('id', '=', id)
    .selectAll()
    .executeTakeFirstOrThrow();
}

export async function removeSource(
  factsDb: FactsAppDatabase,
  sourceId: string
) {
  await factsDb
    .deleteFrom('fact_source')
    .where('id', '=', sourceId)
    .execute();
}

export async function addTag(
  factsDb: FactsAppDatabase,
  env: Env,
  factId: string,
  tag: {
    tagType?: 'text' | 'external_id';
    tagValue: string;
    tagNamespace?: string;
  },
  createdBy: string
) {
  const id = nanoid();
  await factsDb
    .insertInto('fact_tag')
    .values({
      id,
      factId,
      tagType: tag.tagType ?? 'text',
      tagValue: tag.tagValue,
      tagNamespace: tag.tagNamespace ?? null,
      createdAt: new Date().toISOString(),
      createdBy,
    })
    .execute();

  // Re-sync tags to ChromaDB
  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', factId)
    .selectAll()
    .executeTakeFirst();

  if (fact) {
    const allTags = await factsDb
      .selectFrom('fact_tag')
      .where('factId', '=', factId)
      .select('tagValue')
      .execute();

    await syncFactToChroma(
      env,
      fact.brainId,
      {
        id: fact.id,
        content: fact.content,
        type: fact.type,
        status: fact.status,
        trustScore: fact.trustScore,
        createdAt: fact.createdAt,
        updatedAt: fact.updatedAt,
      },
      allTags.map((t) => t.tagValue)
    );
  }

  return factsDb
    .selectFrom('fact_tag')
    .where('id', '=', id)
    .selectAll()
    .executeTakeFirstOrThrow();
}

export async function removeTag(
  factsDb: FactsAppDatabase,
  env: Env,
  factId: string,
  tagId: string
) {
  await factsDb.deleteFrom('fact_tag').where('id', '=', tagId).execute();

  // Re-sync tags to ChromaDB
  const fact = await factsDb
    .selectFrom('fact')
    .where('id', '=', factId)
    .selectAll()
    .executeTakeFirst();

  if (fact) {
    const allTags = await factsDb
      .selectFrom('fact_tag')
      .where('factId', '=', factId)
      .select('tagValue')
      .execute();

    await syncFactToChroma(
      env,
      fact.brainId,
      {
        id: fact.id,
        content: fact.content,
        type: fact.type,
        status: fact.status,
        trustScore: fact.trustScore,
        createdAt: fact.createdAt,
        updatedAt: fact.updatedAt,
      },
      allTags.map((t) => t.tagValue)
    );
  }
}
