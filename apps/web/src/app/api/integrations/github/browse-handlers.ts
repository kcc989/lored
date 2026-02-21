import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';

import {
  listGitHubRepos,
  listGitHubIssues,
} from '@/lib/services/integration-discovery-service';

export async function handleListGitHubRepos({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const page = Number(url.searchParams.get('page') ?? 1);
  const perPage = Number(url.searchParams.get('perPage') ?? 20);
  const sort = (url.searchParams.get('sort') as 'updated' | 'pushed' | 'full_name') ?? 'pushed';

  const result = await listGitHubRepos(env, ctx.user!.id, {
    page,
    perPage,
    sort,
  });

  if ('error' in result) {
    const status = result.error === 'github_not_connected' ? 401 : 400;
    return Response.json(result, { status });
  }

  return Response.json(result);
}

export async function handleListGitHubIssues({
  ctx,
  request,
  params,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const state = (url.searchParams.get('state') as 'open' | 'closed' | 'all') ?? 'open';
  const page = Number(url.searchParams.get('page') ?? 1);
  const perPage = Number(url.searchParams.get('perPage') ?? 20);
  const type = url.searchParams.get('type') as 'issue' | 'pull_request' | undefined;

  const result = await listGitHubIssues(env, ctx.user!.id, {
    owner: params.owner,
    repo: params.repo,
    state,
    page,
    perPage,
    type: type ?? undefined,
  });

  if ('error' in result) {
    const status = result.error === 'github_not_connected' ? 401 : 400;
    return Response.json(result, { status });
  }

  return Response.json(result);
}
