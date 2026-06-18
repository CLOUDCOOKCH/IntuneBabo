import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = 'default', ...props }: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    default:
      'border border-lime-300/70 bg-[linear-gradient(110deg,#39ff14,#00f5ff,#ff00c8)] text-black shadow-[0_0_28px_rgba(57,255,20,0.25)] hover:shadow-[0_0_34px_rgba(255,0,200,0.34)]',
    secondary: 'border border-fuchsia-400/45 bg-fuchsia-950/55 text-lime-100 hover:bg-fuchsia-800/60',
    outline: 'border border-cyan-300/55 bg-background/45 text-foreground hover:border-lime-300 hover:bg-lime-950/40',
    ghost: 'text-muted-foreground hover:bg-fuchsia-950/45 hover:text-lime-100',
    destructive: 'border border-red-300/50 bg-destructive text-destructive-foreground hover:bg-pink-500',
  };

  return (
    <button
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-bold transition disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
