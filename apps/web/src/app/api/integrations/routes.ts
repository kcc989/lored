import { route } from 'rwsdk/router';

import { requireAuth } from '@/lib/middleware/auth';

import { handleIntegrationStatusAll } from './handlers';

export const integrationStatusRoutes = route('/integrations/status', {
  get: [requireAuth, handleIntegrationStatusAll],
});
