'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, BrainIcon } from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { CreateBrainDialog } from './create-brain-dialog';

interface Brain {
  id: string;
  name: string;
  description: string | null;
  teamId: string;
  teamName: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Team {
  id: string;
  name: string;
}

interface Props {
  teams: Team[];
}

export function BrainDashboardContent({ teams }: Props) {
  const [showCreate, setShowCreate] = useState(false);

  const { data: brains, isPending } = useQuery({
    queryKey: ['brains'],
    queryFn: async (): Promise<Brain[]> => {
      const res = await fetch('/api/brains');
      if (!res.ok) throw new Error('Failed to load brains');
      return res.json();
    },
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Brains
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Knowledge bases for your team. Add content and let AI extract
            structured facts.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <PlusIcon className="size-4 mr-1.5" />
          New Brain
        </Button>
      </div>

      {/* Brain grid */}
      {brains && brains.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brains.map((brain) => (
            <a key={brain.id} href={`/brains/${brain.id}`} className="group">
              <Card className="h-full transition-colors hover:ring-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BrainIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{brain.name}</span>
                  </CardTitle>
                  {brain.description && (
                    <CardDescription className="line-clamp-2">
                      {brain.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardFooter className="flex items-center gap-2">
                  <Badge variant="outline">{brain.teamName}</Badge>
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {new Date(brain.updatedAt).toLocaleDateString()}
                  </span>
                </CardFooter>
              </Card>
            </a>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <BrainIcon className="size-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              No brains yet
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Create your first brain to start building a knowledge base.
            </p>
            <Button onClick={() => setShowCreate(true)}>
              <PlusIcon className="size-4 mr-1.5" />
              Create Brain
            </Button>
          </CardContent>
        </Card>
      )}

      <CreateBrainDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        teams={teams}
      />
    </div>
  );
}
