import { prefix, route } from 'rwsdk/router';

import {
  getUserByGitHubAccount,
  getUserOrganizations,
  searchBrainInternal,
  ingestTextInternal,
  ingestGoogleDocInternal,
  ingestLinearResourceInternal,
  listTopicsInternal,
  listQuestionsInternal,
  answerQuestionInternal,
} from './handlers';

export const internalRoutes = prefix('/internal', [
  route('/users/by-github/:accountId', {
    get: getUserByGitHubAccount,
  }),
  route('/users/:userId/organizations', {
    get: getUserOrganizations,
  }),
  route('/search/facts', {
    post: searchBrainInternal,
  }),
  route('/ingest/text', {
    post: ingestTextInternal,
  }),
  route('/ingest/google-doc', {
    post: ingestGoogleDocInternal,
  }),
  route('/ingest/linear', {
    post: ingestLinearResourceInternal,
  }),
  route('/topics', {
    post: listTopicsInternal,
  }),
  route('/questions', {
    post: listQuestionsInternal,
  }),
  route('/questions/answer', {
    post: answerQuestionInternal,
  }),
]);
