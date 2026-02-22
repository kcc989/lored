'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

interface GeneratedFact {
  id: string;
  content: string;
  type: string;
  trustScore: number;
}

interface FollowUpQuestion {
  question: string;
  topic: string;
  reasoning: string;
}

interface DescribeBuildResult {
  factsCreated: GeneratedFact[];
  topicsCreated: string[];
  questionsForUser: FollowUpQuestion[];
}

interface Props {
  brainId: string;
}

export function DescribeBuildInput({ brainId }: Props) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState('');
  const [results, setResults] = useState<DescribeBuildResult | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});

  const buildMutation = useMutation({
    mutationFn: async (text: string): Promise<DescribeBuildResult> => {
      const res = await fetch(
        `/api/brains/${brainId}/describe-and-build`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: text }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error || 'Failed to build facts'
        );
      }
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data);
      setAnswers({});
      toast.success(
        `Created ${data.factsCreated.length} facts and ${data.topicsCreated.length} topics`
      );
      queryClient.invalidateQueries({ queryKey: ['facts', brainId] });
      queryClient.invalidateQueries({ queryKey: ['ingestions', brainId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleBuild = () => {
    if (!description.trim() || description.trim().length < 10) return;
    buildMutation.mutate(description.trim());
  };

  const handleAnswerAndContinue = () => {
    const answeredText = results!.questionsForUser
      .map((q, i) => {
        const answer = answers[i]?.trim();
        if (!answer) return null;
        return `Q: ${q.question}\nA: ${answer}`;
      })
      .filter(Boolean)
      .join('\n\n');

    if (!answeredText) {
      toast.error('Please answer at least one question');
      return;
    }

    const fullText = `Follow-up answers for: ${description.trim().slice(0, 100)}\n\n${answeredText}`;
    buildMutation.mutate(fullText);
  };

  const trustColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="space-y-4 mt-4">
      {/* Description input */}
      <Card>
        <CardHeader>
          <CardTitle>Describe & Build</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Describe your project, product, system, or business rule. Our AI
            will extract structured facts and ask follow-up questions to build
            your knowledge base.
          </p>
          <Textarea
            placeholder="e.g. We are building an e-commerce platform that sells organic produce. Orders over $50 get free shipping. We use Stripe for payments and ship via USPS..."
            rows={6}
            value={description}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setDescription(e.target.value)
            }
          />
          <Button
            onClick={handleBuild}
            disabled={
              !description.trim() ||
              description.trim().length < 10 ||
              buildMutation.isPending
            }
          >
            {buildMutation.isPending ? (
              <span className="flex items-center gap-2">
                <Spinner className="size-3.5" />
                Analyzing and building facts...
              </span>
            ) : (
              'Build Facts'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <>
          {/* Generated facts */}
          {results.factsCreated.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Generated Facts ({results.factsCreated.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {results.factsCreated.map((fact) => (
                    <div
                      key={fact.id}
                      className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground">
                          {fact.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="outline">{fact.type}</Badge>
                        <span
                          className={`text-[11px] font-mono ${trustColor(fact.trustScore)}`}
                        >
                          {Math.round(fact.trustScore * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Topics created */}
          {results.topicsCreated.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground">
                Topics created:
              </span>
              {results.topicsCreated.map((topic) => (
                <Badge key={topic} variant="outline">
                  {topic}
                </Badge>
              ))}
            </div>
          )}

          {/* Follow-up questions */}
          {results.questionsForUser.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Follow-up Questions ({results.questionsForUser.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Answer these questions to help build more detailed facts.
                  You don&apos;t need to answer all of them.
                </p>
                {results.questionsForUser.map((q, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <p className="text-xs font-medium text-foreground flex-1">
                        {q.question}
                      </p>
                      <Badge variant="outline" className="shrink-0">
                        {q.topic}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {q.reasoning}
                    </p>
                    <Textarea
                      placeholder="Your answer..."
                      rows={2}
                      value={answers[i] ?? ''}
                      onChange={(
                        e: React.ChangeEvent<HTMLTextAreaElement>
                      ) =>
                        setAnswers((prev) => ({
                          ...prev,
                          [i]: e.target.value,
                        }))
                      }
                    />
                  </div>
                ))}
                <Button
                  onClick={handleAnswerAndContinue}
                  disabled={
                    buildMutation.isPending ||
                    !Object.values(answers).some((a) => a.trim())
                  }
                >
                  {buildMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <Spinner className="size-3.5" />
                      Processing answers...
                    </span>
                  ) : (
                    'Answer & Continue'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
