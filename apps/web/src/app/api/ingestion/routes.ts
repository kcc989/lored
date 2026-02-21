import { prefix, route } from 'rwsdk/router';

import {
  handleIngestText,
  handleIngestFile,
  handleIngestGoogleDoc,
  handleIngestLinearResource,
  handleIngestGitHub,
  handleBulkIngest,
  handleListIngestions,
  handleGetIngestion,
  handleListIngestedDocuments,
  handleListTopics,
  handleGetTopic,
  handleListTopicQuestions,
  handleAnswerQuestion,
  handleDismissQuestion,
  handleOrganizeBrain,
  handleGetBrainSummary,
} from './handlers';

import { requireAuth } from '@/lib/middleware/auth';
import { requireOrg } from '@/lib/middleware/org';
import { requireBrainAccess } from '@/lib/middleware/brain';

const brainGuard = [requireAuth, requireOrg, requireBrainAccess];

export const ingestionRoutes = prefix('/brains/:brainId', [
  // Ingestion
  route('/ingest/text', {
    post: [...brainGuard, handleIngestText],
  }),
  route('/ingest/file', {
    post: [...brainGuard, handleIngestFile],
  }),
  route('/ingest/google-doc', {
    post: [...brainGuard, handleIngestGoogleDoc],
  }),
  route('/ingest/linear', {
    post: [...brainGuard, handleIngestLinearResource],
  }),
  route('/ingest/github', {
    post: [...brainGuard, handleIngestGitHub],
  }),
  route('/ingest/bulk', {
    post: [...brainGuard, handleBulkIngest],
  }),
  route('/ingested-documents', {
    get: [...brainGuard, handleListIngestedDocuments],
  }),
  route('/ingestions', {
    get: [...brainGuard, handleListIngestions],
  }),
  route('/ingestions/:ingestionId', {
    get: [...brainGuard, handleGetIngestion],
  }),

  // Topics
  route('/topics', {
    get: [...brainGuard, handleListTopics],
  }),
  route('/topics/:topicId', {
    get: [...brainGuard, handleGetTopic],
  }),

  // Topic Questions
  route('/questions', {
    get: [...brainGuard, handleListTopicQuestions],
  }),
  route('/questions/:questionId/answer', {
    post: [...brainGuard, handleAnswerQuestion],
  }),
  route('/questions/:questionId/dismiss', {
    post: [...brainGuard, handleDismissQuestion],
  }),

  // Organization
  route('/organize', {
    post: [...brainGuard, handleOrganizeBrain],
  }),
  route('/summary', {
    get: [...brainGuard, handleGetBrainSummary],
  }),
]);
