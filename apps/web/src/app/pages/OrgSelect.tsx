import { requestInfo } from 'rwsdk/worker';

import { db } from '@/db';
import { OrgSelectContent } from '@/components/org/org-select-content';

export async function OrgSelect() {
  const { ctx } = requestInfo;

  if (!ctx.user) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-6 py-12">
          <p>Please log in first</p>
        </div>
      </div>
    );
  }

  // Fetch user's orgs server-side
  const memberships = await db
    .selectFrom('member')
    .innerJoin('organization', 'organization.id', 'member.organizationId')
    .where('member.userId', '=', ctx.user.id)
    .select(['organization.id', 'organization.name', 'organization.slug'])
    .execute();

  const orgs = memberships.map((m) => ({
    id: m.id,
    name: m.name,
    slug: m.slug,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            {orgs.length > 0 ? 'Select Organization' : 'Create Organization'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {orgs.length > 0
              ? 'Choose an organization to continue'
              : 'Set up your first organization to get started'}
          </p>
        </div>
        <OrgSelectContent orgs={orgs} />
      </div>
    </div>
  );
}
