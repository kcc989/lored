// lib/sidebar.ts
import { parse, serialize } from 'cookie';
import { requestInfo } from 'rwsdk/worker';

export const SIDEBAR_COOKIE = 'sidebar-collapsed';

export const getSidebarCollapsedClient = async () => {
  const { request } = requestInfo;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = parse(cookieHeader);

  return cookies[SIDEBAR_COOKIE] === 'true';
};

/** Read sidebar collapsed state from request cookies, defaulting to false (expanded) */
export function getSidebarCollapsed(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = parse(cookieHeader);

  return cookies[SIDEBAR_COOKIE] === 'true';
}

/** Produce a Set-Cookie header value for the sidebar collapsed state */
export function serializeSidebarCollapsed(collapsed: boolean): string {
  return serialize(SIDEBAR_COOKIE, String(collapsed), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    httpOnly: false, // allow client-side reads
  });
}
