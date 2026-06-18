import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'secondary';

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'border-sky-500/30 bg-sky-100 text-sky-900',
    success: 'border-emerald-500/28 bg-emerald-100 text-emerald-900',
    warning: 'border-amber-500/32 bg-amber-100 text-amber-900',
    destructive: 'border-red-500/30 bg-red-100 text-red-900',
    secondary: 'border-slate-300/70 bg-white/72 text-slate-700',
  };

  return (
    <span
      className={cn('inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold', variants[variant], className)}
      {...props}
    />
  );
}
