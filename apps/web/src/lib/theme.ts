// lib/theme.ts
import { parse, serialize } from 'cookie';
import { requestInfo } from 'rwsdk/worker';
export const THEME_COOKIE = 'ui-theme';

export const getThemeClient = async () => {
  const { request } = requestInfo;
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = parse(cookieHeader);

  return cookies[THEME_COOKIE] === 'dark' ? 'dark' : 'light';
};

/** Read theme from request cookies, defaulting to "light" */
export function getTheme(request: Request): 'light' | 'dark' {
  const cookieHeader = request.headers.get('cookie') ?? '';
  const cookies = parse(cookieHeader);

  return cookies[THEME_COOKIE] === 'dark' ? 'dark' : 'light';
}

/** Produce a Set-Cookie header value for the chosen theme */
export function serializeTheme(theme: 'light' | 'dark'): string {
  return serialize(THEME_COOKIE, theme, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax', // CSRF protection :contentReference[oaicite:0]{index=0}
    httpOnly: false, // allow client-side reads if desired
  });
}
