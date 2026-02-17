'use client';

import { useState } from 'react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { organization } from '@/lib/auth-client';

type Team = {
  id: string;
  name: string;
  parentTeamId: string | null;
};

type CreateTeamDialogProps = {
  teams: Team[];
  onCreated: () => void;
  onCancel: () => void;
};

export function CreateTeamDialog({
  teams,
  onCreated,
  onCancel,
}: CreateTeamDialogProps) {
  const [name, setName] = useState('');
  const [parentTeamId, setParentTeamId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Team name is required');
      return;
    }

    setLoading(true);
    try {
      const data: Record<string, unknown> = { name: name.trim() };
      if (parentTeamId) {
        data.parentTeamId = parentTeamId;
      }

      const result = await organization.createTeam({ data });

      if (result.error) {
        setError(result.error.message || 'Failed to create team');
        return;
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Team</CardTitle>
        <CardDescription>Add a new team to this organization</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Name</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Engineering"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent-team">Parent Team (optional)</Label>
            <Select
              value={parentTeamId ?? undefined}
              onValueChange={(val) =>
                setParentTeamId(val === '__none__' ? null : val)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No parent</SelectItem>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? 'Creating...' : 'Create Team'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
