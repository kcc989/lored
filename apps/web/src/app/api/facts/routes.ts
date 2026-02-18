import { prefix, route } from 'rwsdk/router';

import {
  handleCreateFact,
  handleListFacts,
  handleGetFact,
  handleUpdateFact,
  handleDeleteFact,
  handleAddSource,
  handleRemoveSource,
  handleAddTag,
  handleRemoveTag,
  handleCiteFact,
  handleQuestionFact,
  handleResolveQuestion,
  handleSearchBrain,
  handleSearchAllBrains,
} from './handlers';

import { requireAuth } from '@/lib/middleware/auth';
import { requireOrg } from '@/lib/middleware/org';
import { requireFactsDb, requireBrainAccess } from '@/lib/middleware/brain';

const brainGuard = [requireAuth, requireOrg, requireBrainAccess];

export const factRoutes = prefix('/brains/:brainId', [
  // Facts CRUD
  route('/facts', {
    get: [...brainGuard, handleListFacts],
    post: [...brainGuard, handleCreateFact],
  }),
  route('/facts/:factId', {
    get: [...brainGuard, handleGetFact],
    put: [...brainGuard, handleUpdateFact],
    delete: [...brainGuard, handleDeleteFact],
  }),

  // Sources
  route('/facts/:factId/sources', {
    post: [...brainGuard, handleAddSource],
  }),
  route('/facts/:factId/sources/:sourceId', {
    delete: [...brainGuard, handleRemoveSource],
  }),

  // Tags
  route('/facts/:factId/tags', {
    post: [...brainGuard, handleAddTag],
  }),
  route('/facts/:factId/tags/:tagId', {
    delete: [...brainGuard, handleRemoveTag],
  }),

  // Engagement
  route('/facts/:factId/cite', {
    post: [...brainGuard, handleCiteFact],
  }),
  route('/facts/:factId/question', {
    post: [...brainGuard, handleQuestionFact],
  }),
  route('/facts/:factId/questions/:questionId', {
    put: [...brainGuard, handleResolveQuestion],
  }),

  // Search within brain
  route('/search', {
    post: [...brainGuard, handleSearchBrain],
  }),
]);

// Cross-brain search (not scoped to a single brain)
export const searchRoutes = prefix('/search', [
  route('/facts', {
    post: [requireAuth, requireOrg, requireFactsDb, handleSearchAllBrains],
  }),
]);
