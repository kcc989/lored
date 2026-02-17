import { requestInfo } from 'rwsdk/worker';

import { AppLayout } from '../app-layout';

import { Button } from '@/components/ui/button';

export const Home = () => {
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

  // Show authenticated user's home page
  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12">
          <div className="mb-12">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Welcome{user?.username ? `, ${user.username}` : ''}!
            </h1>
            <p className="text-lg text-muted-foreground mt-2">
              This is your home page.
            </p>
          </div>

          <div className="max-w-4xl">
            <p className="text-muted-foreground">
              Start building your application here.
            </p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};
