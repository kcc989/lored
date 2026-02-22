'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface Team {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: Team[];
}

export function CreateBrainDialog({ open, onOpenChange, teams }: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? '');

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/brains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          teamId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { message?: string }).message || 'Failed to create brain'
        );
      }
      return res.json() as Promise<{ id: string; name: string }>;
    },
    onSuccess: (brain) => {
      toast.success(`Brain "${brain.name}" created`);
      queryClient.invalidateQueries({ queryKey: ['brains'] });
      onOpenChange(false);
      setName('');
      setDescription('');
      window.location.href = `/brains/${brain.id}`;
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Create Brain</AlertDialogTitle>
          <AlertDialogDescription>
            A brain is a knowledge base owned by a team. Add content to it and
            let AI extract structured facts.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="brain-name">Name</Label>
            <Input
              id="brain-name"
              placeholder="e.g. Product Roadmap Q1"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setName(e.target.value)
              }
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brain-description">Description</Label>
            <Textarea
              id="brain-description"
              placeholder="What is this brain about?"
              rows={2}
              value={description}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setDescription(e.target.value)
              }
            />
          </div>

          {teams.length > 1 && (
            <div className="space-y-1.5">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={(v) => setTeamId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || !teamId || mutation.isPending}
          >
            {mutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
