'use client';

import { PlusIcon } from '@phosphor-icons/react';
import { useState } from 'react';

import { CreateOrgDialog } from './create-org-dialog';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { organization } from '@/lib/auth-client';

type Org = {
  id: string;
  name: string;
  slug: string;
};

export function OrgSelectContent({ orgs }: { orgs: Org[] }) {
  const [showCreate, setShowCreate] = useState(orgs.length === 0);

  async function handleSelectOrg(orgId: string) {
    await organization.setActive({ organizationId: orgId });
    window.location.href = '/';
  }

  if (showCreate) {
    return (
      <div className="max-w-md mx-auto">
        <CreateOrgDialog
          onCreated={() => {
            window.location.href = '/';
          }}
          onCancel={orgs.length > 0 ? () => setShowCreate(false) : undefined}
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto space-y-4">
      {orgs.map((org) => (
        <Card
          key={org.id}
          className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
        >
          <button
            className="w-full text-left"
            onClick={() => handleSelectOrg(org.id)}
          >
            <CardHeader>
              <CardTitle>{org.name}</CardTitle>
              <CardDescription>{org.slug}</CardDescription>
            </CardHeader>
          </button>
        </Card>
      ))}
      <Button
        variant="outline"
        className="w-full"
        onClick={() => setShowCreate(true)}
      >
        <PlusIcon className="w-4 h-4 mr-2" />
        Create Organization
      </Button>
    </div>
  );
}
