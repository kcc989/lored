import { requestInfo } from 'rwsdk/worker';

import { AppLayout } from '../app-layout';

import { Button } from '@/components/ui/button';
import { BrainDashboardContent } from '@/components/brain/brain-dashboard-content';
import { db } from '@/db';

export const Home = async () => {
  const { ctx } = requestInfo;
  const user = ctx.user;

  // Show login prompt for unauthenticated users
  if (!ctx.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            App Name
          </h1>
          <p className="text-lg text-muted-foreground">
            Your app description goes here.
          </p>
          <Button size="lg">
            <a href="/login">Get Started</a>
          </Button>
        </div>
      </div>
    );
  }

  // Redirect to org selection if no active organization
  if (!ctx.activeOrganization) {
    return (
      <script
        nonce={requestInfo.rw.nonce}
        dangerouslySetInnerHTML={{
          __html: 'window.location.href = "/org/select";',
        }}
      />
    );
  }

  // Fetch user's teams for the create brain dialog
  const teams = await db
    .selectFrom('teamMember')
    .innerJoin('team', 'team.id', 'teamMember.teamId')
    .where('teamMember.userId', '=', user!.id)
    .where('team.organizationId', '=', ctx.activeOrganization.id)
    .select(['team.id', 'team.name'])
    .execute();

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12">
          <BrainDashboardContent teams={teams} />
        </div>
      </div>
    </AppLayout>
  );
};
