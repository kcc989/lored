import { prefix, route } from 'rwsdk/router';

import { getUserByGitHubAccount, getUserOrganizations, searchBrainInternal } from './handlers';

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
]);
