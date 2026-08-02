import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from './cn';

const DropdownCloseContext = createContext<(() => void) | null>(null);

export function Dropdown({
  trigger,
  children,
  align = 'start',
  className,
}: {
  trigger: ReactElement;
  children: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && !event.composedPath().includes(root)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  const enhanced = isValidElement(trigger)
    ? cloneElement(
        trigger as ReactElement<{
          onClick?: () => void;
          'aria-expanded'?: boolean;
          'aria-haspopup'?: 'menu';
        }>,
        {
          onClick: () => setOpen((value) => !value),
          'aria-expanded': open,
          'aria-haspopup': 'menu',
        },
      )
    : trigger;
  return (
    <div ref={rootRef} className="relative inline-flex">
      {enhanced}
      {open && (
        <DropdownCloseContext.Provider value={() => setOpen(false)}>
          <div
            role="menu"
            className={cn(
              'mac-vibrancy no-drag absolute top-[calc(100%+6px)] z-50 min-w-48 overflow-hidden rounded-xl border border-[var(--stroke)] p-1 shadow-[var(--shadow-popover)]',
              align === 'end' ? 'right-0' : 'left-0',
              className,
            )}
          >
            {children}
          </div>
        </DropdownCloseContext.Provider>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  icon,
  active,
  disabled,
  onClick,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const closeDropdown = useContext(DropdownCloseContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClick?.();
        closeDropdown?.();
      }}
      className={cn(
        'flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[var(--text)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text)]',
        active && 'font-semibold',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
