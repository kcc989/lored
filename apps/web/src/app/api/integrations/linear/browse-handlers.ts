import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';

import {
  listLinearTeams,
  listLinearIssues,
  listLinearProjects,
} from '@/lib/services/integration-discovery-service';

export async function handleListLinearTeams({
  ctx,
}: RequestInfo): Promise<Response> {
  const result = await listLinearTeams(env, ctx.user!.id);

  if ('error' in result) {
    const status = result.error === 'linear_not_connected' ? 401 : 400;
    return Response.json(result, { status });
  }

  return Response.json(result);
}

export async function handleListLinearIssues({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId') ?? undefined;
  const projectId = url.searchParams.get('projectId') ?? undefined;
  const first = Number(url.searchParams.get('first') ?? 20);
  const after = url.searchParams.get('after') ?? undefined;

  const result = await listLinearIssues(env, ctx.user!.id, {
    teamId,
    projectId,
    first,
    after,
  });

  if ('error' in result) {
    const status = result.error === 'linear_not_connected' ? 401 : 400;
    return Response.json(result, { status });
  }

  return Response.json(result);
}

export async function handleListLinearProjects({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const first = Number(url.searchParams.get('first') ?? 20);
  const after = url.searchParams.get('after') ?? undefined;

  const result = await listLinearProjects(env, ctx.user!.id, {
    first,
    after,
  });

  if ('error' in result) {
    const status = result.error === 'linear_not_connected' ? 401 : 400;
    return Response.json(result, { status });
  }

  return Response.json(result);
}
