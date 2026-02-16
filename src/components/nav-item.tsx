'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type NavItemProps = {
  icon: React.ElementType;
  label: string;
  href: string;
  isActive: boolean;
  collapsed: boolean;
};

export function NavItem({
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
        <TooltipTrigger >{linkContent}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}
