'use client';

import { PlusIcon } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { CreateTeamDialog } from './create-team-dialog';
import { TeamTree } from './team-tree';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { organization } from '@/lib/auth-client';

type OrgInfo = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type Team = {
  id: string;
  name: string;
  parentTeamId: string | null;
};

type Member = {
  id: string;
  userId: string;
  role: string;
  user: {
    name: string | null;
    email: string | null;
    image: string | null;
  };
};

async function fetchOrgDetails() {
  const result = await organization.getFullOrganization();
  return result.data;
}

export function OrgSettingsContent({ activeOrg }: { activeOrg: OrgInfo }) {
  return (
    <Tabs defaultValue="general">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="teams">Teams</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <GeneralTab activeOrg={activeOrg} />
      </TabsContent>

      <TabsContent value="members">
        <MembersTab />
      </TabsContent>

      <TabsContent value="teams">
        <TeamsTab />
      </TabsContent>
    </Tabs>
  );
}

function GeneralTab({ activeOrg }: { activeOrg: OrgInfo }) {
  const [name, setName] = useState(activeOrg.name);
  const [slug, setSlug] = useState(activeOrg.slug);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const result = await organization.update({
        data: { name: name.trim(), slug: slug.trim() },
      });
      if (result.error) {
        setMessage(result.error.message || 'Failed to update');
      } else {
        setMessage('Organization updated');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
        <CardDescription>Update your organization name and slug</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-slug">Slug</Label>
            <Input
              id="org-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          {message && (
            <p className="text-sm text-muted-foreground">{message}</p>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function MembersTab() {
  const {
    data: orgData,
    isPending,
    error,
  } = useQuery({
    queryKey: ['org-details'],
    queryFn: fetchOrgDetails,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !orgData) {
    return (
      <div className="text-destructive py-4">
        Failed to load members
      </div>
    );
  }

  const members = (orgData.members ?? []) as Member[];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          {members.length} member{members.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {members.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
            >
              <div>
                <p className="text-sm font-medium">
                  {member.user.name || member.user.email || 'Unknown'}
                </p>
                {member.user.email && (
                  <p className="text-xs text-muted-foreground">
                    {member.user.email}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground capitalize">
                {member.role}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TeamsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: orgData,
    isPending,
    error,
  } = useQuery({
    queryKey: ['org-details'],
    queryFn: fetchOrgDetails,
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !orgData) {
    return (
      <div className="text-destructive py-4">Failed to load teams</div>
    );
  }

  const teams = (orgData.teams ?? []) as Team[];

  async function handleSelectTeam(teamId: string) {
    await organization.setActiveTeam({ teamId });
    window.location.reload();
  }

  if (showCreate) {
    return (
      <div className="mt-4">
        <CreateTeamDialog
          teams={teams}
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['org-details'] });
          }}
          onCancel={() => setShowCreate(false)}
        />
      </div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Teams</CardTitle>
        <CardDescription>
          Manage teams within this organization
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <TeamTree
          teams={teams}
          activeTeamId={null}
          onSelectTeam={handleSelectTeam}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreate(true)}
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          Add Team
        </Button>
      </CardContent>
    </Card>
  );
}
