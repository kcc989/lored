import { prefix, route } from 'rwsdk/router';

import {
  getCurrentUser,
  updateProfile,
  uploadAvatar,
  serveAvatar,
} from './handlers';

import { requireAuth } from '@/lib/middleware/auth';

export const userRoutes = prefix('/users', [
  // Current user profile
  route('/me', {
    get: [requireAuth, getCurrentUser],
  }),
  // Update profile (name, username)
  route('/me/profile', {
    put: [requireAuth, updateProfile],
  }),
  // Avatar upload
  route('/me/avatar', {
    post: [requireAuth, uploadAvatar],
  }),
]);

// Avatar serving route (separate from /users prefix to keep URL clean)
export const avatarRoutes = prefix('/avatars', [
  route('/*', serveAvatar),
]);
