import { prefix, route } from 'rwsdk/router';

import { requireAuth } from '@/lib/middleware/auth';
import { requireOrg } from '@/lib/middleware/org';

import {
  handleLinearConnect,
  handleLinearCallback,
  handleLinearDisconnect,
  handleLinearStatus,
} from './handlers';
import {
  handleListLinearTeams,
  handleListLinearIssues,
  handleListLinearProjects,
} from './browse-handlers';

export const linearIntegrationRoutes = prefix('/integrations/linear', [
  route('/connect', {
    get: [requireAuth, handleLinearConnect],
  }),
  route('/callback', {
    get: [requireAuth, handleLinearCallback],
  }),
  route('/disconnect', {
    post: [requireAuth, handleLinearDisconnect],
  }),
  route('/status', {
    get: [requireAuth, handleLinearStatus],
  }),
  route('/teams', {
    get: [requireAuth, requireOrg, handleListLinearTeams],
  }),
  route('/issues', {
    get: [requireAuth, requireOrg, handleListLinearIssues],
  }),
  route('/projects', {
    get: [requireAuth, requireOrg, handleListLinearProjects],
  }),
]);
