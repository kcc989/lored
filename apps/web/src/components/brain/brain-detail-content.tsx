'use client';

import { useQuery } from '@tanstack/react-query';

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui/tabs';
import { Spinner } from '@/components/ui/spinner';
import { BrainOverviewTab } from './brain-overview-tab';
import { BrainInputContent } from './brain-input-content';
import { BrainFactsContent } from './brain-facts-content';
import { BrainSummaryContent } from './brain-summary-content';
import { DescribeBuildInput } from './describe-build-input';

interface Brain {
  id: string;
  name: string;
  description: string | null;
  teamId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  brainId: string;
}

export function BrainDetailContent({ brainId }: Props) {
  const { data: brain, isPending } = useQuery({
    queryKey: ['brain', brainId],
    queryFn: async (): Promise<Brain> => {
      const res = await fetch(`/api/brains/${brainId}`);
      if (!res.ok) throw new Error('Failed to load brain');
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

  if (!brain) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-muted-foreground">Brain not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {brain.name}
        </h1>
        {brain.description && (
          <p className="text-xs text-muted-foreground mt-1">
            {brain.description}
          </p>
        )}
      </div>

      <Tabs defaultValue={0}>
        <TabsList>
          <TabsTrigger value={0}>Overview</TabsTrigger>
          <TabsTrigger value={1}>Add Content</TabsTrigger>
          <TabsTrigger value={2}>Facts</TabsTrigger>
          <TabsTrigger value={3}>Summary</TabsTrigger>
          <TabsTrigger value={4}>Describe</TabsTrigger>
        </TabsList>
        <TabsContent value={0}>
          <BrainOverviewTab brainId={brainId} brain={brain} />
        </TabsContent>
        <TabsContent value={1}>
          <BrainInputContent brainId={brainId} />
        </TabsContent>
        <TabsContent value={2}>
          <BrainFactsContent brainId={brainId} />
        </TabsContent>
        <TabsContent value={3}>
          <BrainSummaryContent brainId={brainId} />
        </TabsContent>
        <TabsContent value={4}>
          <DescribeBuildInput brainId={brainId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
