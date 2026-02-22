'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';

interface Brain {
  id: string;
  name: string;
  description: string | null;
  teamId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Ingestion {
  id: string;
  sourceType: string;
  title: string;
  status: string;
  factCount: number;
  createdAt: string;
}

interface Props {
  brainId: string;
  brain: Brain;
}

export function BrainOverviewTab({ brainId, brain }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(brain.name);
  const [editDesc, setEditDesc] = useState(brain.description ?? '');
  const [showDelete, setShowDelete] = useState(false);

  const { data: ingestions } = useQuery({
    queryKey: ['ingestions', brainId],
    queryFn: async (): Promise<Ingestion[]> => {
      const res = await fetch(
        `/api/brains/${brainId}/ingestions?limit=5`
      );
      if (!res.ok) return [];
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brains/${brainId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to update brain');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Brain updated');
      queryClient.invalidateQueries({ queryKey: ['brain', brainId] });
      queryClient.invalidateQueries({ queryKey: ['brains'] });
      setEditing(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brains/${brainId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete brain');
    },
    onSuccess: () => {
      toast.success('Brain deleted');
      window.location.href = '/';
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4 mt-4">
      {/* Brain info */}
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {editing ? (
            <>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={editName}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEditName(e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={editDesc}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setEditDesc(e.target.value)
                  }
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate()}
                  disabled={!editName.trim() || updateMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Created{' '}
                    {new Date(brain.createdAt).toLocaleDateString()}
                  </p>
                  {brain.description && (
                    <p className="text-xs text-foreground mt-1">
                      {brain.description}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditName(brain.name);
                    setEditDesc(brain.description ?? '');
                    setEditing(true);
                  }}
                >
                  Edit
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent ingestions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Ingestions</CardTitle>
        </CardHeader>
        <CardContent>
          {ingestions && ingestions.length > 0 ? (
            <div className="space-y-2">
              {ingestions.map((ing) => (
                <div
                  key={ing.id}
                  className="flex items-center gap-2 text-xs"
                >
                  <Badge variant="outline" className="shrink-0">
                    {ing.sourceType.replace(/_/g, ' ')}
                  </Badge>
                  <span className="truncate flex-1">{ing.title}</span>
                  <span className="text-muted-foreground shrink-0">
                    {ing.factCount} facts
                  </span>
                  <Badge
                    variant={
                      ing.status === 'completed' ? 'default' : 'outline'
                    }
                    className="shrink-0"
                  >
                    {ing.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No content ingested yet. Use the &ldquo;Add Content&rdquo;
              tab to get started.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDelete(true)}
          >
            Delete Brain
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brain</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{brain.name}&rdquo; and all
              its facts, topics, and ingestion history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
