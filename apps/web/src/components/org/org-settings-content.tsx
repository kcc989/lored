'use client';

import { DotsThreeVerticalIcon, PlusIcon } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { CreateTeamDialog } from './create-team-dialog';
import { InviteMemberDialog } from './invite-member-dialog';
import { TeamDetailPanel } from './team-detail-panel';
import { TeamTree } from './team-tree';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date | string;
  createdAt: Date | string;
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
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<Member | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const {
    data: orgData,
    isPending,
    error,
  } = useQuery({
    queryKey: ['org-details'],
    queryFn: fetchOrgDetails,
  });

  const { data: invitationsData } = useQuery({
    queryKey: ['org-invitations'],
    queryFn: async () => {
      const result = await organization.listInvitations();
      return (result.data ?? []) as Invitation[];
    },
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
  const pendingInvitations = (invitationsData ?? []).filter(
    (inv) => inv.status === 'pending'
  );

  async function handleUpdateRole(memberId: string, newRole: string) {
    try {
      const result = await organization.updateMemberRole({
        memberId,
        role: newRole,
      });
      if (result.error) {
        toast.error(result.error.message || 'Failed to update role');
        return;
      }
      toast.success('Role updated');
      queryClient.invalidateQueries({ queryKey: ['org-details'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    }
  }

  async function handleRemoveMember() {
    if (!memberToRemove) return;
    setRemoveLoading(true);
    try {
      const result = await organization.removeMember({
        memberIdOrEmail: memberToRemove.id,
      });
      if (result.error) {
        toast.error(result.error.message || 'Failed to remove member');
        return;
      }
      toast.success('Member removed');
      setMemberToRemove(null);
      queryClient.invalidateQueries({ queryKey: ['org-details'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setRemoveLoading(false);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    try {
      await organization.cancelInvitation({ invitationId });
      toast.success('Invitation cancelled');
      queryClient.invalidateQueries({ queryKey: ['org-invitations'] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    }
  }

  if (showInvite) {
    return (
      <div className="mt-4">
        <InviteMemberDialog
          onInvited={() => {
            setShowInvite(false);
            queryClient.invalidateQueries({ queryKey: ['org-invitations'] });
          }}
          onCancel={() => setShowInvite(false)}
        />
      </div>
    );
  }

  return (
    <>
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                {members.length} member{members.length !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowInvite(true)}
            >
              <PlusIcon className="w-4 h-4 mr-1" />
              Invite Member
            </Button>
          </div>
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
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize">
                    {member.role}
                  </Badge>
                  {member.role !== 'owner' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon-sm">
                            <DotsThreeVerticalIcon className="w-4 h-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Change Role</DropdownMenuLabel>
                        <DropdownMenuItem
                          disabled={member.role === 'member'}
                          onClick={() => handleUpdateRole(member.id, 'member')}
                        >
                          Set as Member
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={member.role === 'admin'}
                          onClick={() => handleUpdateRole(member.id, 'admin')}
                        >
                          Set as Admin
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setMemberToRemove(member)}
                        >
                          Remove Member
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pendingInvitations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Pending Invitations ({pendingInvitations.length})
              </p>
              <div className="space-y-2">
                {pendingInvitations.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-1.5"
                  >
                    <div>
                      <p className="text-sm">{inv.email}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {inv.role}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancelInvitation(inv.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={memberToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setMemberToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove?.user.name || memberToRemove?.user.email} will be
              removed from this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeLoading}
              onClick={handleRemoveMember}
            >
              {removeLoading ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TeamsTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
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

  const teams = (orgData.teams ?? []) as unknown as Team[];
  const members = (orgData.members ?? []) as Member[];

  function handleSelectTeam(teamId: string) {
    setSelectedTeamId((prev) => (prev === teamId ? null : teamId));
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

  const selectedTeam = selectedTeamId
    ? teams.find((t) => t.id === selectedTeamId) ?? null
    : null;

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
          activeTeamId={selectedTeamId}
          onSelectTeam={handleSelectTeam}
        />

        {selectedTeam && (
          <TeamDetailPanel
            team={selectedTeam}
            orgMembers={members}
            onDeleted={() => {
              setSelectedTeamId(null);
              queryClient.invalidateQueries({ queryKey: ['org-details'] });
            }}
            onClose={() => setSelectedTeamId(null)}
          />
        )}

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
