import { prefix, route } from 'rwsdk/router';

import { requireAuth } from '@/lib/middleware/auth';
import { requireOrg } from '@/lib/middleware/org';

import {
  handleGoogleConnect,
  handleGoogleCallback,
  handleGoogleDisconnect,
  handleGoogleStatus,
} from './handlers';

export const googleIntegrationRoutes = prefix('/integrations/google', [
  route('/connect', {
    get: [requireAuth, requireOrg, handleGoogleConnect],
  }),
  route('/callback', {
    get: [requireAuth, handleGoogleCallback],
  }),
  route('/disconnect', {
    post: [requireAuth, handleGoogleDisconnect],
  }),
  route('/status', {
    get: [requireAuth, handleGoogleStatus],
  }),
]);
