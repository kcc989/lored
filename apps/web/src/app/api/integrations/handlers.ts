import type { RequestInfo } from 'rwsdk/worker';

import { getGitHubIntegrationConnection } from '@/lib/services/github-auth-service';
import { getGoogleConnection } from '@/lib/services/google-auth-service';
import { getLinearConnection } from '@/lib/services/linear-auth-service';

/**
 * Return the connection status of all three integration providers.
 */
export async function handleIntegrationStatusAll({
  ctx,
}: RequestInfo): Promise<Response> {
  const userId = ctx.user!.id;

  const [githubConn, googleConn, linearConn] = await Promise.all([
    getGitHubIntegrationConnection(userId),
    getGoogleConnection(userId),
    getLinearConnection(userId),
  ]);

  const github = githubConn
    ? (() => {
        const meta = githubConn.metadata ? JSON.parse(githubConn.metadata) : {};
        return {
          connected: true as const,
          login: meta.login ?? null,
          name: meta.name ?? null,
          connectedAt: githubConn.createdAt,
        };
      })()
    : { connected: false as const };

  const google = googleConn
    ? (() => {
        const meta = googleConn.metadata ? JSON.parse(googleConn.metadata) : {};
        return {
          connected: true as const,
          email: meta.email ?? null,
          name: meta.name ?? null,
          connectedAt: googleConn.createdAt,
        };
      })()
    : { connected: false as const };

  const linear = linearConn
    ? (() => {
        const meta = linearConn.metadata ? JSON.parse(linearConn.metadata) : {};
        return {
          connected: true as const,
          email: meta.email ?? null,
          name: meta.name ?? null,
          displayName: meta.displayName ?? null,
          connectedAt: linearConn.createdAt,
        };
      })()
    : { connected: false as const };

  return Response.json({ github, google, linear });
}
