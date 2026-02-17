'use client';

import {
  BuildingsIcon,
  CaretUpDownIcon,
  CheckIcon,
  GearIcon,
  PlusIcon,
  UsersIcon,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { organization } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type OrgInfo = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type TeamInfo = {
  id: string;
  name: string;
  parentTeamId: string | null;
};

type OrgSwitcherProps = {
  activeOrg: OrgInfo | null;
  activeTeam: TeamInfo | null;
  collapsed: boolean;
};

type OrgListItem = {
  id: string;
  name: string;
  slug: string;
};

export function OrgSwitcher({
  activeOrg,
  activeTeam,
  collapsed,
}: OrgSwitcherProps) {
  const [orgs, setOrgs] = useState<OrgListItem[]>([]);

  useEffect(() => {
    organization.list().then((result) => {
      if (result.data) {
        setOrgs(
          result.data.map((o) => ({
            id: o.id,
            name: o.name,
            slug: o.slug,
          }))
        );
      }
    });
  }, []);

  async function handleSwitchOrg(orgId: string) {
    await organization.setActive({ organizationId: orgId });
    window.location.href = '/';
  }

  if (!activeOrg) {
    return (
      <a
        href="/org/select"
        className={cn(
          'flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 transition-colors',
          collapsed && 'justify-center px-0'
        )}
      >
        <BuildingsIcon className="w-4 h-4 shrink-0" />
        {!collapsed && <span>Select Organization</span>}
      </a>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center w-full rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/50 outline-none',
          collapsed && 'justify-center px-0'
        )}
      >
        <BuildingsIcon className="w-4 h-4 shrink-0" />
        {!collapsed && (
          <>
            <div className="ml-2 flex-1 text-left min-w-0">
              <p className="font-medium truncate text-sidebar-foreground">
                {activeOrg.name}
              </p>
              {activeTeam && (
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {activeTeam.name}
                </p>
              )}
            </div>
            <CaretUpDownIcon className="w-4 h-4 shrink-0 text-sidebar-foreground/40" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => handleSwitchOrg(org.id)}
          >
            <BuildingsIcon className="w-4 h-4 mr-2" />
            <span className="flex-1 truncate">{org.name}</span>
            {org.id === activeOrg.id && (
              <CheckIcon className="w-4 h-4 ml-2" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.href = '/org/select';
          }}
        >
          <PlusIcon className="w-4 h-4 mr-2" />
          Create Organization
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            window.location.href = '/org/settings';
          }}
        >
          <GearIcon className="w-4 h-4 mr-2" />
          Organization Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
