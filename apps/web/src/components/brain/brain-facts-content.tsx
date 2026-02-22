'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';

import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

interface Fact {
  id: string;
  content: string;
  type: string;
  status: string;
  trustScore: number;
  createdAt: string;
}

interface SearchResult {
  factId: string;
  content: string;
  type: string;
  trustScore: number;
  score: number;
}

interface Props {
  brainId: string;
}

export function BrainFactsContent({ brainId }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(
    null
  );

  const { data: facts, isPending } = useQuery({
    queryKey: ['facts', brainId],
    queryFn: async (): Promise<Fact[]> => {
      const res = await fetch(`/api/brains/${brainId}/facts`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/brains/${brainId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { results?: SearchResult[] } | SearchResult[];
        setSearchResults(Array.isArray(data) ? data : data.results ?? []);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const trustColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const displayFacts = searchResults
    ? searchResults.map((r) => ({
        id: r.factId,
        content: r.content,
        type: r.type,
        status: 'active',
        trustScore: r.trustScore,
        createdAt: '',
      }))
    : facts;

  if (isPending) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-5" />
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search facts..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter') handleSearch();
            }}
            className="pl-8"
          />
        </div>
      </div>

      {searchResults && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{searchResults.length} results</span>
          <button
            onClick={() => {
              setSearchResults(null);
              setSearchQuery('');
            }}
            className="underline hover:text-foreground"
          >
            Clear search
          </button>
        </div>
      )}

      {isSearching && (
        <div className="flex justify-center py-8">
          <Spinner className="size-5" />
        </div>
      )}

      {/* Facts list */}
      {displayFacts && displayFacts.length > 0 ? (
        <div className="space-y-2">
          {displayFacts.map((fact) => (
            <Card key={fact.id} size="sm">
              <CardContent className="py-2">
                <div className="flex items-start gap-2">
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !isSearching && (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-xs text-muted-foreground">
                {searchResults
                  ? 'No facts match your search.'
                  : 'No facts yet. Add content to start building your knowledge base.'}
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
