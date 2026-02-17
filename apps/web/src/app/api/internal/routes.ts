import { prefix, route } from 'rwsdk/router';

import { getUserByGitHubAccount } from './handlers';

export const internalRoutes = prefix('/internal', [
  route('/users/by-github/:accountId', {
    get: getUserByGitHubAccount,
  }),
]);
