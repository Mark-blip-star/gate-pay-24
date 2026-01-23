import React from 'react';

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-white/5 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur',
        className,
      )}
      {...props}
    />
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-indigo-400/60 disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<string, string> = {
    primary: 'bg-indigo-500 text-white hover:bg-indigo-400',
    ghost: 'bg-white/0 text-white hover:bg-white/10',
    danger: 'bg-rose-500 text-white hover:bg-rose-400',
  };
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function Input({
  label,
  error,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-white/80">{label}</div>
      <input
        className={cn(
          'w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-white placeholder:text-white/40 focus:border-indigo-400/60 focus:outline-none focus:ring-2 focus:ring-indigo-400/30',
          className,
        )}
        {...props}
      />
      {error ? <div className="mt-1 text-xs text-rose-300">{error}</div> : null}
    </label>
  );
}


