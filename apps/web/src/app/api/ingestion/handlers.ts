import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '@/lib/errors';
import {
  ingestText,
  ingestFile,
  ingestGoogleDoc,
  ingestGitHubContent,
  detectGoogleDocInText,
  ingestLinearResource,
  detectLinearUrlInText,
  detectGitHubUrlInText,
  getIngestion,
  listIngestions,
  listIngestedDocuments,
} from '@/lib/services/ingestion-service';
import { bulkIngest } from '@/lib/services/batch-ingestion-service';
import {
  organizeBrain,
  getBrainSummary,
} from '@/lib/services/organization-agent-service';
import { describeAndBuild } from '@/lib/services/describe-build-service';
import { listTopics, getTopic } from '@/lib/services/topic-service';
import {
  listTopicQuestions,
  answerTopicQuestion,
  dismissTopicQuestion,
} from '@/lib/services/topic-question-service';

// --- Schemas ---

const ingestTextSchema = z.object({
  text: z.string().min(1),
  title: z.string().max(500).optional(),
});

const answerQuestionSchema = z.object({
  answer: z.string().min(1),
  createFact: z.boolean().optional().default(true),
});

// --- Ingestion Handlers ---

export async function handleIngestText({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = ingestTextSchema.parse(body);

  // Auto-detect Google Doc URLs pasted as text
  const googleDocUrl = detectGoogleDocInText(input.text);
  if (googleDocUrl) {
    const result = await ingestGoogleDoc(ctx.factsDb!, env, {
      brainId: params.brainId,
      documentUrl: googleDocUrl,
      userId: ctx.user!.id,
    });

    // Check for structured error responses
    if ('error' in result) {
      const status = result.error === 'google_not_connected' ? 401
        : result.error === 'google_access_denied' ? 403
        : result.error === 'google_doc_not_found' ? 404
        : result.error === 'google_doc_too_large' ? 413
        : result.error === 'no_changes' ? 200
        : 400;
      return Response.json(result, { status });
    }

    return Response.json(result, { status: 201 });
  }

  // Auto-detect Linear URLs pasted as text
  const linearUrl = detectLinearUrlInText(input.text);
  if (linearUrl) {
    const result = await ingestLinearResource(ctx.factsDb!, env, {
      brainId: params.brainId,
      resourceUrl: linearUrl,
      userId: ctx.user!.id,
    });

    if ('error' in result) {
      const status = result.error === 'linear_not_connected' ? 401
        : result.error === 'linear_access_denied' ? 403
        : result.error === 'linear_not_found' ? 404
        : result.error === 'no_changes' ? 200
        : 400;
      return Response.json(result, { status });
    }

    return Response.json(result, { status: 201 });
  }

  // Auto-detect GitHub URLs pasted as text
  const githubUrl = detectGitHubUrlInText(input.text);
  if (githubUrl) {
    const result = await ingestGitHubContent(ctx.factsDb!, env, {
      brainId: params.brainId,
      contentUrl: githubUrl,
      userId: ctx.user!.id,
    });

    if ('error' in result) {
      const status = result.error === 'github_not_connected' ? 401
        : result.error === 'github_access_denied' ? 403
        : result.error === 'github_not_found' ? 404
        : result.error === 'github_content_too_large' ? 413
        : result.error === 'no_changes' ? 200
        : 400;
      return Response.json(result, { status });
    }

    return Response.json(result, { status: 201 });
  }

  const result = await ingestText(ctx.factsDb!, env, {
    brainId: params.brainId,
    text: input.text,
    title: input.title,
    userId: ctx.user!.id,
  });

  return Response.json(result, { status: 201 });
}

export async function handleIngestFile({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const formData = await request.formData();
  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    throw new ValidationError('Missing file field');
  }

  const allowedTypes = [
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'text/plain',
    'text/markdown',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new ValidationError(
      `Unsupported file type: ${file.type}. Allowed: ${allowedTypes.join(', ')}`
    );
  }

  const maxSize = 20 * 1024 * 1024; // 20MB
  if (file.size > maxSize) {
    throw new ValidationError('File size exceeds 20MB limit');
  }

  const arrayBuffer = await file.arrayBuffer();

  const result = await ingestFile(ctx.factsDb!, env, {
    brainId: params.brainId,
    file: arrayBuffer,
    filename: file.name,
    mimeType: file.type,
    userId: ctx.user!.id,
  });

  return Response.json(result, { status: 201 });
}

export async function handleListIngestions({
  ctx,
  params,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 20);

  const ingestions = await listIngestions(ctx.factsDb!, params.brainId, {
    status,
    page,
    limit,
  });

  return Response.json(ingestions);
}

export async function handleGetIngestion({
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const ingestion = await getIngestion(ctx.factsDb!, params.ingestionId);
  if (!ingestion) {
    throw new NotFoundError('Ingestion not found');
  }
  return Response.json(ingestion);
}

// --- Topic Handlers ---

export async function handleListTopics({
  ctx,
  params,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') ?? undefined;
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 50);

  const topics = await listTopics(ctx.factsDb!, params.brainId, {
    status,
    page,
    limit,
  });

  return Response.json(topics);
}

export async function handleGetTopic({
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const topic = await getTopic(ctx.factsDb!, params.topicId);
  if (!topic) {
    throw new NotFoundError('Topic not found');
  }
  return Response.json(topic);
}

// --- Topic Question Handlers ---

export async function handleListTopicQuestions({
  ctx,
  params,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const topicId = url.searchParams.get('topicId') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const priority = url.searchParams.get('priority') ?? undefined;
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 50);

  const questions = await listTopicQuestions(ctx.factsDb!, params.brainId, {
    topicId,
    status,
    priority,
    page,
    limit,
  });

  return Response.json(questions);
}

export async function handleAnswerQuestion({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = answerQuestionSchema.parse(body);

  const result = await answerTopicQuestion(ctx.factsDb!, env, {
    questionId: params.questionId,
    answer: input.answer,
    answeredBy: ctx.user!.id,
    createFactFromAnswer: input.createFact,
    brainId: params.brainId,
  });

  return Response.json(result);
}

export async function handleDismissQuestion({
  params,
  ctx,
}: RequestInfo): Promise<Response> {
  await dismissTopicQuestion(ctx.factsDb!, params.questionId);
  return Response.json({ success: true });
}

// --- Google Docs Handlers ---

const ingestGoogleDocSchema = z.object({
  documentUrl: z.string().url(),
});

export async function handleIngestGoogleDoc({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = ingestGoogleDocSchema.parse(body);

  const result = await ingestGoogleDoc(ctx.factsDb!, env, {
    brainId: params.brainId,
    documentUrl: input.documentUrl,
    userId: ctx.user!.id,
  });

  if ('error' in result) {
    const status = result.error === 'google_not_connected' ? 401
      : result.error === 'google_access_denied' ? 403
      : result.error === 'google_doc_not_found' ? 404
      : result.error === 'google_doc_too_large' ? 413
      : result.error === 'no_changes' ? 200
      : 400;
    return Response.json(result, { status });
  }

  return Response.json(result, { status: 201 });
}

// --- Linear Handlers ---

const ingestLinearSchema = z.object({
  resourceUrl: z.string().url(),
});

export async function handleIngestLinearResource({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = ingestLinearSchema.parse(body);

  const result = await ingestLinearResource(ctx.factsDb!, env, {
    brainId: params.brainId,
    resourceUrl: input.resourceUrl,
    userId: ctx.user!.id,
  });

  if ('error' in result) {
    const status = result.error === 'linear_not_connected' ? 401
      : result.error === 'linear_access_denied' ? 403
      : result.error === 'linear_not_found' ? 404
      : result.error === 'no_changes' ? 200
      : 400;
    return Response.json(result, { status });
  }

  return Response.json(result, { status: 201 });
}

// --- GitHub Handlers ---

const ingestGitHubSchema = z.object({
  contentUrl: z.string().url(),
});

export async function handleIngestGitHub({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = ingestGitHubSchema.parse(body);

  const result = await ingestGitHubContent(ctx.factsDb!, env, {
    brainId: params.brainId,
    contentUrl: input.contentUrl,
    userId: ctx.user!.id,
  });

  if ('error' in result) {
    const status = result.error === 'github_not_connected' ? 401
      : result.error === 'github_access_denied' ? 403
      : result.error === 'github_not_found' ? 404
      : result.error === 'github_content_too_large' ? 413
      : result.error === 'no_changes' ? 200
      : 400;
    return Response.json(result, { status });
  }

  return Response.json(result, { status: 201 });
}

export async function handleListIngestedDocuments({
  ctx,
  params,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? 1);
  const limit = Number(url.searchParams.get('limit') ?? 20);

  const documents = await listIngestedDocuments(ctx.factsDb!, params.brainId, {
    page,
    limit,
  });

  return Response.json(documents);
}

// --- Bulk Ingestion Handler ---

const bulkIngestItemSchema = z.object({
  type: z.enum(['google_doc', 'github', 'linear', 'text']),
  documentUrl: z.string().url().optional(),
  contentUrl: z.string().url().optional(),
  resourceUrl: z.string().url().optional(),
  text: z.string().optional(),
  title: z.string().max(500).optional(),
});

const bulkIngestSchema = z.object({
  items: z.array(bulkIngestItemSchema).min(1).max(10),
});

export async function handleBulkIngest({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = bulkIngestSchema.parse(body);

  const result = await bulkIngest(ctx.factsDb!, env, {
    brainId: params.brainId,
    userId: ctx.user!.id,
    items: input.items,
  });

  return Response.json(result);
}

// --- Organization Handlers ---

export async function handleOrganizeBrain({
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const result = await organizeBrain(ctx.factsDb!, env, {
    brainId: params.brainId,
  });

  return Response.json(result);
}

export async function handleGetBrainSummary({
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const summary = await getBrainSummary(ctx.factsDb!, params.brainId);
  if (!summary) {
    throw new NotFoundError('No summary available. Run organization first.');
  }
  return Response.json(summary);
}

// --- Describe & Build Handler ---

const describeAndBuildSchema = z.object({
  description: z.string().min(10).max(5000),
});

export async function handleDescribeAndBuild({
  request,
  ctx,
  params,
}: RequestInfo): Promise<Response> {
  const body = await request.json();
  const input = describeAndBuildSchema.parse(body);

  const result = await describeAndBuild(ctx.factsDb!, env, {
    brainId: params.brainId,
    description: input.description,
    userId: ctx.user!.id,
  });

  return Response.json(result, { status: 201 });
}
