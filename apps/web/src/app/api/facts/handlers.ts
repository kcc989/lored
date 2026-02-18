import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  createFact,
  updateFact,
  getFact,
  listFacts,
  deleteFact,
  addSource,
  removeSource,
  addTag,
  removeTag,
} from '@/lib/services/fact-service';
import {
  recordCitation,
  questionFact,
  resolveQuestion,
} from '@/lib/services/fact-engagement-service';
import { searchFacts, searchFactsAcrossBrains } from '@/lib/services/fact-search-service';
import { getFactsDb } from '@/db/facts';
import { getCachedTeamMemberships } from '@/lib/services/team-membership-cache';
import { listBrainsForTeams } from '@/lib/services/brain-service';

// --- Schemas ---

const createFactSchema = z.object({
  content: z.string().min(1),
  type: z.enum(['general', 'policy', 'procedure', 'definition', 'decision', 'insight']).optional(),
  sources: z.array(z.object({
    sourceType: z.enum(['document', 'link', 'person']),
    title: z.string().optional(),
    url: z.string().url().optional(),
    userId: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
  tags: z.array(z.object({
    tagType: z.enum(['text', 'external_id']).optional(),
    tagValue: z.string().min(1),
    tagNamespace: z.string().optional(),
  })).optional(),
});

const updateFactSchema = z.object({
  content: z.string().min(1).optional(),
  type: z.enum(['general', 'policy', 'procedure', 'definition', 'decision', 'insight']).optional(),
  changeReason: z.string().optional(),
});

const addSourceSchema = z.object({
  sourceType: z.enum(['document', 'link', 'person']),
  title: z.string().optional(),
  url: z.string().url().optional(),
  userId: z.string().optional(),
  description: z.string().optional(),
});

const addTagSchema = z.object({
  tagType: z.enum(['text', 'external_id']).optional(),
  tagValue: z.string().min(1),
  tagNamespace: z.string().optional(),
});

const citationSchema = z.object({
  citationContext: z.string().optional(),
  sourceType: z.enum(['user', 'agent']).optional(),
});

const questionSchema = z.object({
  reason: z.string().min(1),
});

const resolveQuestionSchema = z.object({
  resolution: z.string().min(1),
  newStatus: z.enum(['resolved_valid', 'resolved_updated', 'resolved_deprecated']),
});

const searchSchema = z.object({
  queries: z.array(z.string().min(1)).min(1),
  type: z.string().optional(),
  status: z.string().optional(),
  minTrustScore: z.number().min(0).max(1).optional(),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// --- Fact CRUD ---

export async function handleCreateFact({ ctx, request }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = createFactSchema.parse(body);

  const fact = await createFact(ctx.factsDb!, env, {
    brainId: ctx.activeBrain!.id,
    content: input.content,
    type: input.type,
    sources: input.sources,
    tags: input.tags,
    userId: ctx.user!.id,
  });

  return Response.json(fact, { status: 201 });
}

export async function handleListFacts({ ctx, request }: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const page = parseInt(url.searchParams.get('page') ?? '1', 10);
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10);

  const facts = await listFacts(ctx.factsDb!, ctx.activeBrain!.id, {
    type,
    status,
    page,
    limit,
  });

  return Response.json(facts);
}

export async function handleGetFact({ ctx, params }: RequestInfo): Promise<Response> {
  const fact = await getFact(ctx.factsDb!, params.factId);
  if (!fact) throw new NotFoundError('Fact not found');
  return Response.json(fact);
}

export async function handleUpdateFact({ ctx, request, params }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = updateFactSchema.parse(body);

  const fact = await updateFact(ctx.factsDb!, env, {
    factId: params.factId,
    content: input.content,
    type: input.type,
    changeReason: input.changeReason,
    userId: ctx.user!.id,
  });

  return Response.json(fact);
}

export async function handleDeleteFact({ ctx, params }: RequestInfo): Promise<Response> {
  await deleteFact(ctx.factsDb!, env, params.factId);
  return new Response(null, { status: 204 });
}

// --- Sources ---

export async function handleAddSource({ ctx, request, params }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = addSourceSchema.parse(body);

  const source = await addSource(ctx.factsDb!, params.factId, input, ctx.user!.id);
  return Response.json(source, { status: 201 });
}

export async function handleRemoveSource({ ctx, params }: RequestInfo): Promise<Response> {
  await removeSource(ctx.factsDb!, params.sourceId);
  return new Response(null, { status: 204 });
}

// --- Tags ---

export async function handleAddTag({ ctx, request, params }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = addTagSchema.parse(body);

  const tag = await addTag(ctx.factsDb!, env, params.factId, input, ctx.user!.id);
  return Response.json(tag, { status: 201 });
}

export async function handleRemoveTag({ ctx, params }: RequestInfo): Promise<Response> {
  await removeTag(ctx.factsDb!, env, params.factId, params.tagId);
  return new Response(null, { status: 204 });
}

// --- Engagement ---

export async function handleCiteFact({ ctx, request, params }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = citationSchema.parse(body);

  await recordCitation(ctx.factsDb!, env, {
    factId: params.factId,
    citedBy: ctx.user!.id,
    citationContext: input.citationContext,
    sourceType: input.sourceType,
  });

  return Response.json({ success: true }, { status: 201 });
}

export async function handleQuestionFact({ ctx, request, params }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = questionSchema.parse(body);

  await questionFact(ctx.factsDb!, env, {
    factId: params.factId,
    questionedBy: ctx.user!.id,
    reason: input.reason,
  });

  return Response.json({ success: true }, { status: 201 });
}

export async function handleResolveQuestion({ ctx, request, params }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = resolveQuestionSchema.parse(body);

  await resolveQuestion(ctx.factsDb!, env, {
    questionId: params.questionId,
    resolvedBy: ctx.user!.id,
    resolution: input.resolution,
    newStatus: input.newStatus,
  });

  return Response.json({ success: true });
}

// --- Search ---

export async function handleSearchBrain({ ctx, request }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = searchSchema.parse(body);

  const results = await searchFacts(env, ctx.factsDb!, {
    brainId: ctx.activeBrain!.id,
    queries: input.queries,
    type: input.type,
    status: input.status,
    minTrustScore: input.minTrustScore,
    tags: input.tags,
    limit: input.limit,
  });

  return Response.json(results);
}

/**
 * Search across all brains accessible to the user in the active org.
 */
export async function handleSearchAllBrains({ ctx, request }: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = searchSchema.parse(body);

  const factsDb = ctx.factsDb ?? getFactsDb(ctx.activeOrganization!.id);

  // Get all accessible brains
  const memberships = await getCachedTeamMemberships(
    factsDb,
    ctx.user!.id,
    ctx.activeOrganization!.id
  );
  const teamIds = memberships.map((m) => m.teamId);
  const brains = await listBrainsForTeams(factsDb, teamIds);
  const brainIds = brains.map((b) => b.id);

  if (brainIds.length === 0) {
    return Response.json([]);
  }

  const results = await searchFactsAcrossBrains(env, factsDb, {
    brainIds,
    queries: input.queries,
    type: input.type,
    status: input.status,
    minTrustScore: input.minTrustScore,
    limit: input.limit,
  });

  return Response.json(results);
}
