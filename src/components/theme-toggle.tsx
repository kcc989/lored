'use client';

import { MoonIcon, SunIcon } from '@phosphor-icons/react';
import { useState, useEffect } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type ThemeToggleProps = {
  collapsed?: boolean;
};

export function ThemeToggle({ collapsed = false }: ThemeToggleProps) {
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
