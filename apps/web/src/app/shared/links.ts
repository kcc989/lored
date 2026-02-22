import { defineLinks } from 'rwsdk/router';

export const link = defineLinks([
  '/',
  '/login',
  '/settings',
  '/org/select',
  '/org/settings',
  '/brains/:brainId/input',
  '/brains/:brainId/summary',
  '/brains/:brainId',
]);
