import { requestInfo } from 'rwsdk/worker';

import { SettingsContent } from '@/components/settings/settings-content';

export async function Settings() {
  const { ctx } = requestInfo;

  if (!ctx.user) {
    return (
      <div className="min-h-screen bg-background ">
        <div className="container mx-auto px-6 py-12">
          <p>Please log in to view settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background ">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage your profile and preferences
          </p>
        </div>
        <SettingsContent />
      </div>
    </div>
  );
}
