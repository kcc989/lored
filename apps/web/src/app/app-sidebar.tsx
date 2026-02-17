'use client';

import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  HouseSimpleIcon,
  MoonIcon,
  SignOutIcon,
  SunIcon,
} from '@phosphor-icons/react';
import { useState, useEffect, createContext, useContext } from 'react';

import { OrgSwitcher } from '@/components/org/org-switcher';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { signOut } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebarState() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebarState must be used within AppSidebarProvider');
  }
  return context;
}

type AppSidebarProps = {
  username: string | null;
  email?: string;
  initialCollapsed: boolean;
  activeOrg: {
    id: string;
    name: string;
    slug: string;
    role: string;
  } | null;
  activeTeam: {
    id: string;
    name: string;
    parentTeamId: string | null;
  } | null;
};

type NavItemProps = {
  icon: React.ElementType;
  label: string;
  href: string;
  isActive: boolean;
  collapsed: boolean;
};

function NavItem({
  icon: Icon,
  label,
  href,
  isActive,
  collapsed,
}: NavItemProps) {
  const linkContent = (
    <a
      href={href}
      className={cn(
        'group relative flex items-center rounded-md transition-all duration-200',
        collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-3 py-2.5',
        isActive
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50'
      )}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && (
        <span
          className={cn(
            'text-[15px] transition-opacity duration-200',
            isActive ? 'font-medium' : 'font-normal'
          )}
        >
          {label}
        </span>
      )}
    </a>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger>{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}

function InlineThemeToggle({ collapsed }: { collapsed: boolean }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const htmlTheme = document.documentElement.className;
    const savedTheme = window.localStorage.getItem('ui-theme') as
      | 'light'
      | 'dark'
      | null;
    const actualTheme = savedTheme || (htmlTheme === 'dark' ? 'dark' : 'light');
    setTheme(actualTheme);
  }, []);

  async function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('ui-theme', next);
    await fetch(`/theme/set/${next}`, { method: 'POST' });
    document.documentElement.classList.remove(theme);
    document.documentElement.classList.add(next);
    setTheme(next);
  }

  if (!mounted) return null;

  const button = (
    <button
      onClick={toggle}
      className={cn(
        'flex items-center rounded-md transition-all duration-200 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
        collapsed
          ? 'justify-center h-10 w-10 mx-auto'
          : 'gap-3 px-3 py-2.5 w-full'
      )}
    >
      {theme === 'dark' ? (
        <SunIcon className="w-[18px] h-[18px] shrink-0" />
      ) : (
        <MoonIcon className="w-[18px] h-[18px] shrink-0" />
      )}
      {!collapsed && (
        <span className="text-[15px]">
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </span>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger >{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="font-medium">
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

function SignOutButton({ collapsed }: { collapsed: boolean }) {
  const button = (
    <button
      onClick={() => signOut()}
      className={cn(
        'flex items-center rounded-md transition-all duration-200 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
        collapsed
          ? 'justify-center h-10 w-10 mx-auto'
          : 'gap-3 px-3 py-2.5 w-full'
      )}
    >
      <SignOutIcon className="w-[18px] h-[18px] shrink-0" />
      {!collapsed && <span className="text-[15px]">Sign out</span>}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger >{button}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="font-medium">
          Sign out
        </TooltipContent>
      </Tooltip>
    );
  }

  return button;
}

export function AppSidebar({
  username,
  email,
  initialCollapsed,
  activeOrg,
  activeTeam,
}: AppSidebarProps) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const handleSetCollapsed = async (value: boolean) => {
    setCollapsed(value);
    window.dispatchEvent(
      new CustomEvent('sidebar-toggle', { detail: { collapsed: value } })
    );
    // Update server-side cookie
    await fetch(`/sidebar/set/${value}`, { method: 'POST' });
  };

  const navItems = [{ icon: HouseSimpleIcon, label: 'Home', href: '/' }];

  const displayName = username || email;
  const initials = displayName
    ? displayName
        .split(/[\s@]/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0].toUpperCase())
        .join('')
    : '?';

  const collapseButton = (
    <button
      onClick={() => handleSetCollapsed(!collapsed)}
      className={cn(
        'flex items-center rounded-md transition-all duration-200 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
        collapsed
          ? 'justify-center h-10 w-10 mx-auto'
          : 'gap-3 px-3 py-2.5 w-full'
      )}
    >
      {collapsed ? (
        <CaretDoubleRightIcon className="w-[18px] h-[18px] shrink-0" />
      ) : (
        <CaretDoubleLeftIcon className="w-[18px] h-[18px] shrink-0" />
      )}
      {!collapsed && <span className="text-[15px]">Collapse</span>}
    </button>
  );

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <TooltipProvider>
        <aside
          className={cn(
            'fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 ease-out z-40',
            collapsed ? 'w-16' : 'w-64'
          )}
        >
          {/* Vertical accent line */}
          <div className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-primary/20 to-transparent dark:via-primary/40" />

          {/* Header */}
          <div
            className={cn(
              'relative border-b border-sidebar-border/50 transition-all duration-300',
              collapsed ? 'px-3 py-5' : 'px-5 py-6'
            )}
          >
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger >
                  <div className="w-10 h-10 mx-auto rounded-lg bg-sidebar-accent border border-sidebar-border flex items-center justify-center cursor-default">
                    <span className="text-sm font-semibold text-sidebar-foreground">
                      {initials}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  <p className="font-semibold">App Name</p>
                  <p className="text-xs text-muted-foreground">{displayName}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                <h1 className="font-serif text-[19px] font-semibold tracking-[-0.01em] text-sidebar-foreground">
                  App Name
                </h1>
                <p className="text-[13px] font-normal text-muted-foreground mt-0.5 truncate">
                  {displayName}
                </p>
              </>
            )}
          </div>

          {/* Org Switcher */}
          <div
            className={cn(
              'border-b border-sidebar-border/50 py-2 transition-all duration-300',
              collapsed ? 'px-3' : 'px-3'
            )}
          >
            <OrgSwitcher
              activeOrg={activeOrg}
              activeTeam={activeTeam}
              collapsed={collapsed}
            />
          </div>

          {/* Navigation */}
          <nav
            className={cn(
              'flex-1 py-4 transition-all duration-300',
              collapsed ? 'px-3 space-y-1' : 'px-3 space-y-1'
            )}
          >
            {navItems.map((item) => {
              const isActive =
                typeof window !== 'undefined' &&
                window.location.pathname === item.href;
              return (
                <NavItem
                  key={item.href}
                  icon={item.icon}
                  label={item.label}
                  href={item.href}
                  isActive={isActive}
                  collapsed={collapsed}
                />
              );
            })}
          </nav>

          {/* Footer */}
          <div
            className={cn(
              'border-t border-sidebar-border/50 py-3 space-y-1 transition-all duration-300',
              collapsed ? 'px-3' : 'px-3'
            )}
          >
            <InlineThemeToggle collapsed={collapsed} />
            <SignOutButton collapsed={collapsed} />

            {collapsed ? (
              <Tooltip>
                <TooltipTrigger >{collapseButton}</TooltipTrigger>
                <TooltipContent
                  side="right"
                  sideOffset={8}
                  className="font-medium"
                >
                  Expand sidebar
                </TooltipContent>
              </Tooltip>
            ) : (
              collapseButton
            )}
          </div>
        </aside>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}
