import { requestInfo } from 'rwsdk/worker';

import { OrgSettingsContent } from '@/components/org/org-settings-content';

export function OrgSettings() {
  const { ctx } = requestInfo;

  if (!ctx.user || !ctx.activeOrganization) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12">
          <p>Please select an organization first</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Organization Settings
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage {ctx.activeOrganization.name}
          </p>
        </div>
        <div className="max-w-2xl">
          <OrgSettingsContent activeOrg={ctx.activeOrganization} />
        </div>
      </div>
    </div>
  );
}
