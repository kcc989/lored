import { prefix, route } from 'rwsdk/router';

import { getUserByGitHubAccount, getUserOrganizations } from './handlers';

export const internalRoutes = prefix('/internal', [
  route('/users/by-github/:accountId', {
    get: getUserByGitHubAccount,
  }),
  route('/users/:userId/organizations', {
    get: getUserOrganizations,
  }),
]);
