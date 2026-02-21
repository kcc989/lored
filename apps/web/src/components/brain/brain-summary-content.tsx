'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { TopicTree } from './topic-tree';

const topicHierarchyNodeSchema: z.ZodType = z.object({
  topicId: z.string(),
  name: z.string(),
  description: z.string(),
  factCount: z.number(),
  coverageScore: z.number(),
  summary: z.string(),
  keyInsights: z.array(z.string()),
  children: z.lazy(() => z.array(topicHierarchyNodeSchema)),
});

const brainSummarySchema = z.object({
  summary: z.string(),
  topicHierarchy: z.array(topicHierarchyNodeSchema),
  totalFacts: z.number(),
  totalTopics: z.number(),
  averageCoverage: z.number(),
  generatedAt: z.string(),
});

type BrainSummaryData = z.infer<typeof brainSummarySchema>;

interface Props {
  brainId: string;
}

export function BrainSummaryContent({ brainId }: Props) {
  const queryClient = useQueryClient();

  const {
    data: summary,
    isPending,
  } = useQuery({
    queryKey: ['brain-summary', brainId],
    queryFn: async (): Promise<BrainSummaryData | null> => {
      const res = await fetch(`/api/brains/${brainId}/summary`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to load summary');
      return brainSummarySchema.parse(await res.json());
    },
  });

  const organizeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/brains/${brainId}/organize`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Organization failed');
      return res.json();
    },
    onSuccess: () => {
      toast.success('Brain organized successfully');
      queryClient.invalidateQueries({
        queryKey: ['brain-summary', brainId],
      });
    },
    onError: (err) => {
      toast.error(`Organization failed: ${err.message}`);
    },
  });

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Brain Summary
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {summary
              ? `Last organized ${new Date(summary.generatedAt).toLocaleDateString()}`
              : 'Not yet organized'}
          </p>
        </div>
        <Button
          onClick={() => organizeMutation.mutate()}
          disabled={organizeMutation.isPending}
        >
          {organizeMutation.isPending
            ? 'Organizing...'
            : summary
              ? 'Re-organize'
              : 'Organize Brain'}
        </Button>
      </div>

      {summary ? (
        <>
          {/* Overview card */}
          <Card>
            <CardHeader>
              <CardTitle>Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-foreground leading-relaxed">
                {summary.summary}
              </p>
              <div className="flex gap-2 mt-3">
                <Badge variant="outline">{summary.totalFacts} facts</Badge>
                <Badge variant="outline">{summary.totalTopics} topics</Badge>
                <Badge variant="outline">
                  {Math.round(summary.averageCoverage * 100)}% coverage
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Topic hierarchy */}
          <Card>
            <CardHeader>
              <CardTitle>Topic Hierarchy</CardTitle>
              <CardDescription>
                Topics organized by category with summaries
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TopicTree nodes={summary.topicHierarchy} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-xs text-muted-foreground">
              Click &ldquo;Organize Brain&rdquo; to have AI analyze your facts
              and create a structured summary with topic hierarchy.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
