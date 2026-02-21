import { env } from 'cloudflare:workers';
import type { RequestInfo } from 'rwsdk/worker';

import { listGoogleDocuments } from '@/lib/services/integration-discovery-service';

export async function handleListGoogleDocuments({
  ctx,
  request,
}: RequestInfo): Promise<Response> {
  const url = new URL(request.url);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
  const pageToken = url.searchParams.get('pageToken') ?? undefined;
  const query = url.searchParams.get('q') ?? undefined;

  const result = await listGoogleDocuments(env, ctx.user!.id, {
    pageSize,
    pageToken,
    query,
  });

  if ('error' in result) {
    const status = result.error === 'google_not_connected' ? 401 : 400;
    return Response.json(result, { status });
  }

  return Response.json(result);
}
