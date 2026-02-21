'use client';

import { PlusIcon, XIcon } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { organization } from '@/lib/auth-client';

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

type TeamMember = {
  id: string;
  teamId: string;
  userId: string;
  createdAt: Date | string;
};

type TeamDetailPanelProps = {
  team: Team;
  orgMembers: Member[];
  onDeleted: () => void;
  onClose: () => void;
};

export function TeamDetailPanel({
  team,
  orgMembers,
  onDeleted,
  onClose,
}: TeamDetailPanelProps) {
  const queryClient = useQueryClient();
  const [addingMember, setAddingMember] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addLoading, setAddLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const {
    data: teamMembers,
    isPending,
  } = useQuery({
    queryKey: ['team-members', team.id],
    queryFn: async () => {
      const result = await organization.listTeamMembers({
        query: { teamId: team.id },
      });
      return (result.data ?? []) as TeamMember[];
    },
  });

  async function handleAddTeamMember() {
    if (!selectedUserId) return;
    setAddLoading(true);
    try {
      const result = await organization.addTeamMember({
        teamId: team.id,
        userId: selectedUserId,
      });
      if (result.error) {
        toast.error(result.error.message || 'Failed to add member');
        return;
      }
      toast.success('Member added to team');
      queryClient.invalidateQueries({ queryKey: ['team-members', team.id] });
      setSelectedUserId(null);
      setAddingMember(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleRemoveTeamMember(userId: string) {
    try {
      await organization.removeTeamMember({
        teamId: team.id,
        userId,
      });
      toast.success('Member removed from team');
      queryClient.invalidateQueries({ queryKey: ['team-members', team.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    }
  }

  async function handleDeleteTeam() {
    setDeleteLoading(true);
    try {
      const result = await organization.removeTeam({ teamId: team.id });
      if (result.error) {
        toast.error(result.error.message || 'Failed to delete team');
        return;
      }
      toast.success('Team deleted');
      queryClient.invalidateQueries({ queryKey: ['org-details'] });
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setDeleteLoading(false);
    }
  }

  const availableMembers = orgMembers.filter(
    (m) => !teamMembers?.some((tm) => tm.userId === m.userId)
  );

  return (
    <div className="border border-border rounded-lg p-4 space-y-4 mt-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{team.name}</p>
          <p className="text-xs text-muted-foreground">
            {teamMembers?.length ?? 0} member
            {(teamMembers?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" size="sm">
                  Delete Team
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete &ldquo;{team.name}&rdquo;?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the team. Members will not be
                  removed from the organization.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteLoading}
                  onClick={handleDeleteTeam}
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Team'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {isPending ? (
        <div className="flex items-center justify-center py-4">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <div className="space-y-2">
          {(teamMembers ?? []).map((tm) => {
            const orgMember = orgMembers.find((m) => m.userId === tm.userId);
            return (
              <div
                key={tm.id}
                className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium">
                    {orgMember?.user.name ||
                      orgMember?.user.email ||
                      tm.userId}
                  </p>
                  {orgMember?.user.email && (
                    <p className="text-xs text-muted-foreground">
                      {orgMember.user.email}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveTeamMember(tm.userId)}
                >
                  <XIcon className="w-3.5 h-3.5" />
                </Button>
              </div>
            );
          })}
          {(teamMembers ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              No members in this team yet
            </p>
          )}
        </div>
      )}

      {addingMember ? (
        <div className="flex items-center gap-2">
          <Select
            value={selectedUserId ?? undefined}
            onValueChange={setSelectedUserId}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select a member" />
            </SelectTrigger>
            <SelectContent>
              {availableMembers.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.user.name || m.user.email || m.userId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedUserId || addLoading}
            onClick={handleAddTeamMember}
          >
            {addLoading ? 'Adding...' : 'Add'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAddingMember(false);
              setSelectedUserId(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAddingMember(true)}
        >
          <PlusIcon className="w-4 h-4 mr-1" />
          Add Member
        </Button>
      )}
    </div>
  );
}
