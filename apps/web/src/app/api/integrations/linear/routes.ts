import { prefix, route } from 'rwsdk/router';

import { requireAuth } from '@/lib/middleware/auth';
import { requireOrg } from '@/lib/middleware/org';

import {
  handleLinearConnect,
  handleLinearCallback,
  handleLinearDisconnect,
  handleLinearStatus,
} from './handlers';

export const linearIntegrationRoutes = prefix('/integrations/linear', [
  route('/connect', {
    get: [requireAuth, requireOrg, handleLinearConnect],
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
]);
