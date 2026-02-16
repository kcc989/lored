'use client';

import { useState, useEffect } from 'react';

import { cn } from '@/lib/utils';

const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

type AppMainContentProps = {
  children: React.ReactNode;
};

export function AppMainContent({ children }: AppMainContentProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === 'true') {
      setCollapsed(true);
    }

    // Listen for custom event from sidebar toggle
    const handleSidebarToggle = (e: CustomEvent<{ collapsed: boolean }>) => {
      setCollapsed(e.detail.collapsed);
    };

    window.addEventListener(
      'sidebar-toggle',
      handleSidebarToggle as EventListener
    );

    return () => {
      window.removeEventListener(
        'sidebar-toggle',
        handleSidebarToggle as EventListener
      );
    };
  }, []);

  // Prevent flash of wrong position
  if (!mounted) {
    return (
      <div className="min-h-screen bg-background ml-64 transition-[margin-left] duration-300 ease-out">
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'min-h-screen bg-background transition-[margin-left] duration-300 ease-out',
        collapsed ? 'ml-16' : 'ml-64'
      )}
    >
      {children}
    </div>
  );
}
