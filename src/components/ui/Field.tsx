import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './cn';

const control =
  'w-full rounded-lg border border-[var(--stroke-strong)] bg-[var(--surface-raised)] px-2.5 text-[13px] text-[var(--text)] shadow-sm outline-none transition focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)] disabled:opacity-50';

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('grid gap-1.5 text-[12px] font-medium text-[var(--text-secondary)]', className)}
    >
      {label && <span>{label}</span>}
      {children}
      {error ? (
        <span className="font-normal text-[var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="font-normal text-[var(--text-tertiary)]">{hint}</span>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(control, 'h-8', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea ref={ref} className={cn(control, 'min-h-20 resize-y py-2', className)} {...props} />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(control, 'h-8 appearance-none pr-7', className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[22px] w-[38px] rounded-full border border-black/8 p-0.5 transition-colors disabled:opacity-50',
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--surface-hover)]',
      )}
    >
      <span
        className={cn(
          'block size-4 rounded-full bg-white shadow-sm transition-transform',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}
