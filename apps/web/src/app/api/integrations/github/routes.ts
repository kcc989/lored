import { prefix, route } from 'rwsdk/router';

import { requireAuth } from '@/lib/middleware/auth';
import { requireOrg } from '@/lib/middleware/org';

import {
  handleGitHubIntegrationConnect,
  handleGitHubIntegrationCallback,
  handleGitHubIntegrationDisconnect,
  handleGitHubIntegrationStatus,
} from './handlers';
import {
  handleListGitHubRepos,
  handleListGitHubIssues,
} from './browse-handlers';

export const githubIntegrationRoutes = prefix('/integrations/github', [
  route('/connect', {
    get: [requireAuth, handleGitHubIntegrationConnect],
  }),
  route('/callback', {
    get: [requireAuth, handleGitHubIntegrationCallback],
  }),
  route('/disconnect', {
    post: [requireAuth, handleGitHubIntegrationDisconnect],
  }),
  route('/status', {
    get: [requireAuth, handleGitHubIntegrationStatus],
  }),
  route('/repos', {
    get: [requireAuth, requireOrg, handleListGitHubRepos],
  }),
  route('/repos/:owner/:repo/issues', {
    get: [requireAuth, requireOrg, handleListGitHubIssues],
  }),
]);
