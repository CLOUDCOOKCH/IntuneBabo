import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'secondary';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'border-lime-300/60 bg-lime-300 text-black',
    success: 'border-lime-300/50 bg-lime-300/20 text-lime-100',
    warning: 'border-yellow-300/55 bg-yellow-300/20 text-yellow-100',
    destructive: 'border-pink-300/55 bg-pink-500/22 text-pink-100',
    secondary: 'border-cyan-300/35 bg-cyan-950/55 text-cyan-100',
  };

  return (
    <span
      className={cn('inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-bold', variants[variant], className)}
      {...props}
    />
  );
}
