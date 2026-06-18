import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({ className, variant = 'default', ...props }: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    default: 'border border-sky-600 bg-[#0078d4] text-white shadow-[0_8px_18px_rgba(0,120,212,0.24)] hover:bg-[#106ebe] hover:shadow-[0_12px_24px_rgba(0,120,212,0.28)]',
    secondary: 'border border-slate-300/70 bg-white/72 text-slate-800 shadow-sm hover:bg-blue-50/80 hover:text-slate-950',
    outline: 'border border-slate-300/80 bg-white/52 text-slate-800 shadow-sm hover:border-sky-400 hover:bg-white/82',
    ghost: 'text-slate-600 hover:bg-white/62 hover:text-slate-950',
    destructive: 'border border-red-600 bg-red-600 text-white shadow-[0_8px_18px_rgba(220,38,38,0.2)] hover:bg-red-700',
  };

  return (
    <button
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
