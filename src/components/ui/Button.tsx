import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'xs' | 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  primary:
    'border-transparent bg-[var(--accent)] text-white shadow-sm hover:brightness-105 active:brightness-95',
  secondary:
    'border-[var(--stroke-strong)] bg-[var(--surface-raised)] text-[var(--text)] shadow-sm hover:bg-[var(--surface-hover)]',
  ghost:
    'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]',
  danger: 'border-transparent bg-[var(--danger)] text-white shadow-sm hover:brightness-105',
};

const sizes: Record<Size, string> = {
  xs: 'h-7 gap-1.5 rounded-lg px-2 text-xs',
  sm: 'h-8 gap-1.5 rounded-lg px-2.5 text-[13px]',
  md: 'h-9 gap-2 rounded-[10px] px-3.5 text-[13px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'sm', icon, loading, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center border font-medium transition-[background,color,filter,box-shadow] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size="sm" /> : icon}
      {children}
    </button>
  );
});

export function Spinner({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dimensions = size === 'sm' ? 'size-3.5' : size === 'lg' ? 'size-6' : 'size-4';
  return (
    <output
      className={cn(
        dimensions,
        'inline-block animate-[spin_.7s_linear_infinite] rounded-full border-2 border-current border-r-transparent opacity-70',
        className,
      )}
      aria-label="Loading"
    />
  );
}
