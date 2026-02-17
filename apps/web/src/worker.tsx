import { env } from 'cloudflare:workers';
import { realtimeRoute } from 'rwsdk/realtime/worker';
import { layout, prefix, render, route } from 'rwsdk/router';
import { defineApp, type RequestInfo } from 'rwsdk/worker';

import { internalRoutes } from './app/api/internal/routes';
import { userRoutes, avatarRoutes } from './app/api/users/routes';
import { AppLayout } from './app/app-layout';
import { getSidebarCollapsed } from './lib/sidebar';
import { getTheme, serializeTheme } from './lib/theme';

import { Document } from '@/app/Document';
import { setCommonHeaders } from '@/app/headers';
import { Home } from '@/app/pages/Home';
import { Login } from '@/app/pages/Login';
import { OrgSelect } from '@/app/pages/OrgSelect';
import { OrgSettings } from '@/app/pages/OrgSettings';
import { Settings } from '@/app/pages/Settings';
import type { Session, User } from '@/lib/auth';
import { createAuth } from '@/lib/auth';
import { db } from '@/db';

export { Database } from '@/db/centralDbDurableObject';
export { RealtimeDurableObject } from 'rwsdk/realtime/durableObject';

export type AppContext = {
  session: Session | null;
  user: User | null;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  activeOrganization: {
    id: string;
    name: string;
    slug: string;
    role: string;
  } | null;
  activeTeam: {
    id: string;
    name: string;
    parentTeamId: string | null;
  } | null;
};

let auth: ReturnType<typeof createAuth> | null = null;

const app = defineApp<RequestInfo<Record<string, string>, AppContext>>([
  setCommonHeaders(),
  async ({ ctx, request }) => {
    auth = createAuth(env);
    const session = await auth.api.getSession({
      headers: request.headers,
    });
    ctx.session = session || null;
    ctx.user = session?.user || null;
    ctx.theme = getTheme(request);
    ctx.sidebarCollapsed = getSidebarCollapsed(request);
    ctx.activeOrganization = null;
    ctx.activeTeam = null;

    // Resolve active organization from session
    if (session?.session?.activeOrganizationId && session.user) {
      const orgMember = await db
        .selectFrom('member')
        .innerJoin('organization', 'organization.id', 'member.organizationId')
        .where('member.userId', '=', session.user.id)
        .where(
          'member.organizationId',
          '=',
          session.session.activeOrganizationId
        )
        .select([
          'organization.id',
          'organization.name',
          'organization.slug',
          'member.role',
        ])
        .executeTakeFirst();

      if (orgMember) {
        ctx.activeOrganization = {
          id: orgMember.id,
          name: orgMember.name,
          slug: orgMember.slug,
          role: orgMember.role,
        };
      }
    }

    // Resolve active team from session
    if (
      session?.session?.activeTeamId &&
      ctx.activeOrganization
    ) {
      const team = await db
        .selectFrom('team')
        .where('team.id', '=', session.session.activeTeamId)
        .where('team.organizationId', '=', ctx.activeOrganization.id)
        .select(['team.id', 'team.name', 'team.parentTeamId'])
        .executeTakeFirst();

      if (team) {
        ctx.activeTeam = {
          id: team.id,
          name: team.name,
          parentTeamId: team.parentTeamId ?? null,
        };
      }
    }
  },
  route('/api/auth/*', async ({ request }) => {
    if (!auth) {
      auth = createAuth(env);
    }
    return auth.handler(request);
  }),
  route('/theme/set/:theme', ({ params }) => {
    const t = params.theme === 'dark' ? 'dark' : 'light';

    const res = Response.json({ success: true, theme: t });
    res.headers.set('Set-Cookie', serializeTheme(t));
    return res;
  }),
  route('/theme', ({ request }) => {
    const theme = getTheme(request);

    const response = new Response(JSON.stringify({ theme }));
    response.headers.set('Set-Cookie', serializeTheme(theme));
    return response;
  }),
  realtimeRoute(() => env.REALTIME_DURABLE_OBJECT),
  prefix('/api', [internalRoutes, userRoutes, avatarRoutes]),
  render(Document, [
    route('/', Home),
    route('/login', Login),
    route('/org/select', OrgSelect),
    layout(AppLayout, [
      route('/settings', Settings),
      route('/org/settings', OrgSettings),
    ]),
  ]),
]);

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
