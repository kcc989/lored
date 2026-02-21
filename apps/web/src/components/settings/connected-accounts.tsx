'use client';

import { GithubLogoIcon, GoogleLogoIcon, SpinnerIcon } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { LinearIcon } from '@/components/icons/linear-icon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ProviderStatus = {
  connected: boolean;
  connectedAt?: string;
  login?: string | null;
  email?: string | null;
  name?: string | null;
  displayName?: string | null;
};

type IntegrationStatuses = {
  github: ProviderStatus;
  google: ProviderStatus;
  linear: ProviderStatus;
};

async function fetchIntegrationStatuses(): Promise<IntegrationStatuses> {
  const response = await fetch('/api/integrations/status');
  if (!response.ok) throw new Error('Failed to fetch integration statuses');
  return response.json();
}

async function disconnectProvider(provider: string): Promise<void> {
  const response = await fetch(`/api/integrations/${provider}/disconnect`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error(`Failed to disconnect ${provider}`);
}

const PROVIDERS = [
  {
    key: 'github' as const,
    name: 'GitHub',
    description: 'Issues, projects, repositories, and PRs',
    icon: GithubLogoIcon,
    connectUrl: '/api/integrations/github/connect',
    disconnectKey: 'github',
    getDetail: (s: ProviderStatus) => (s.login ? `@${s.login}` : s.name),
  },
  {
    key: 'google' as const,
    name: 'Google',
    description: 'Google Docs (read-only)',
    icon: GoogleLogoIcon,
    connectUrl: '/api/integrations/google/connect',
    disconnectKey: 'google',
    getDetail: (s: ProviderStatus) => s.email ?? s.name,
  },
  {
    key: 'linear' as const,
    name: 'Linear',
    description: 'Projects and issues',
    icon: LinearIcon,
    connectUrl: '/api/integrations/linear/connect',
    disconnectKey: 'linear',
    getDetail: (s: ProviderStatus) => s.displayName ?? s.name ?? s.email,
  },
];

export function ConnectedAccounts() {
  const queryClient = useQueryClient();

  const { data: statuses, isPending } = useQuery({
    queryKey: ['integration-statuses'],
    queryFn: fetchIntegrationStatuses,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let toastShown = false;

    for (const provider of ['github', 'google', 'linear']) {
      if (params.get(`${provider}_connected`) === 'true') {
        const label = provider.charAt(0).toUpperCase() + provider.slice(1);
        toast.success(`${label} connected successfully`);
        toastShown = true;
      }
      const error = params.get(`${provider}_error`);
      if (error) {
        const label = provider.charAt(0).toUpperCase() + provider.slice(1);
        toast.error(`Failed to connect ${label}: ${error}`);
        toastShown = true;
      }
    }

    if (toastShown) {
      const url = new URL(window.location.href);
      for (const provider of ['github', 'google', 'linear']) {
        url.searchParams.delete(`${provider}_connected`);
        url.searchParams.delete(`${provider}_error`);
      }
      window.history.replaceState({}, '', url.pathname);
      queryClient.invalidateQueries({ queryKey: ['integration-statuses'] });
    }
  }, [queryClient]);

  const disconnectMutation = useMutation({
    mutationFn: disconnectProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-statuses'] });
      toast.success('Account disconnected');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disconnect');
    },
  });

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-6">
        <SpinnerIcon className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {PROVIDERS.map((provider) => {
        const status = statuses?.[provider.key];
        const Icon = provider.icon;
        const detail = status?.connected ? provider.getDetail(status) : null;
        const isDisconnecting =
          disconnectMutation.isPending &&
          disconnectMutation.variables === provider.disconnectKey;

        return (
          <div
            key={provider.key}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{provider.name}</span>
                  {status?.connected && (
                    <Badge variant="secondary">Connected</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {detail ?? provider.description}
                </p>
              </div>
            </div>
            <div>
              {status?.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isDisconnecting}
                  onClick={() =>
                    disconnectMutation.mutate(provider.disconnectKey)
                  }
                >
                  {isDisconnecting ? (
                    <SpinnerIcon className="h-3 w-3 animate-spin" />
                  ) : (
                    'Disconnect'
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    window.location.href = provider.connectUrl;
                  }}
                >
                  Connect
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
