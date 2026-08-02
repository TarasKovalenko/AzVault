import type { HTMLAttributes } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'blue' | 'green' | 'orange' | 'red' | 'purple';

const tones: Record<Tone, string> = {
  neutral: 'bg-[var(--surface-muted)] text-[var(--text-secondary)]',
  blue: 'bg-blue-500/12 text-blue-600 dark:text-blue-400',
  green: 'bg-green-500/12 text-green-700 dark:text-green-400',
  orange: 'bg-orange-500/12 text-orange-700 dark:text-orange-400',
  red: 'bg-red-500/12 text-red-700 dark:text-red-400',
  purple: 'bg-purple-500/12 text-purple-700 dark:text-purple-400',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
