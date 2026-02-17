import type { LayoutProps } from 'rwsdk/router';
import { requestInfo } from 'rwsdk/worker';

import { AppMainContent } from './app-main-content';
import { AppSidebar } from './app-sidebar';

import { QueryClientProvider } from '@/components/query-client-provider';

export function AppLayout({ children }: LayoutProps) {
  const { ctx } = requestInfo;
  const user = ctx.user;

  if (!user) return null;

  return (
    <QueryClientProvider>
      <AppSidebar
        initialCollapsed={ctx.sidebarCollapsed}
        username={user.username ?? null}
        email={user.email}
      />
      <AppMainContent>{children}</AppMainContent>
    </QueryClientProvider>
  );
}
