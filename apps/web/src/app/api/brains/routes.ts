import { prefix, route } from 'rwsdk/router';

import {
  handleCreateBrain,
  handleListBrains,
  handleGetBrain,
  handleUpdateBrain,
  handleDeleteBrain,
} from './handlers';

import { requireAuth } from '@/lib/middleware/auth';
import { requireOrg } from '@/lib/middleware/org';
import { requireFactsDb, requireBrainAccess } from '@/lib/middleware/brain';

export const brainRoutes = prefix('/brains', [
  // List accessible brains / Create a brain
  route('/', {
    get: [requireAuth, requireOrg, requireFactsDb, handleListBrains],
    post: [requireAuth, requireOrg, requireFactsDb, handleCreateBrain],
  }),
  // Single brain operations (requires brain access check)
  route('/:brainId', {
    get: [requireAuth, requireOrg, requireBrainAccess, handleGetBrain],
    put: [requireAuth, requireOrg, requireBrainAccess, handleUpdateBrain],
    delete: [requireAuth, requireOrg, requireBrainAccess, handleDeleteBrain],
  }),
]);
