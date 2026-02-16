import type { RequestInfo } from 'rwsdk/worker';

import { UnauthorizedError } from '@/lib/errors';

export function requireAuth({ ctx }: RequestInfo) {
  if (!ctx.user) {
    throw new UnauthorizedError('User is not authenticated');
  }
}
