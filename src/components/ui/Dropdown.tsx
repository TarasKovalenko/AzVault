import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from './cn';

const DropdownCloseContext = createContext<(() => void) | null>(null);

/** Enabled menu items, in DOM order: the roving-focus ring. */
const menuItems = (menu: HTMLElement | null) =>
  Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);

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
  const menuRef = useRef<HTMLDivElement>(null);
  // The trigger is always the first child of the root; the menu follows it.
  const focusTrigger = useCallback(() => {
    const element = rootRef.current?.firstElementChild;
    if (element instanceof HTMLElement) element.focus();
  }, []);
  const closeAndRestore = useCallback(() => {
    setOpen(false);
    focusTrigger();
  }, [focusTrigger]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && !event.composedPath().includes(root)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        focusTrigger();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, focusTrigger]);
  // Opening a menu moves focus into it, so the keyboard lands where the eye does.
  useEffect(() => {
    if (open) menuItems(menuRef.current)[0]?.focus();
  }, [open]);
  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(menuRef.current);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(current + 1) % items.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(current - 1 + items.length) % items.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      // Tabbing out dismisses the menu. Focus has to land back on the trigger
      // first, or the focused item unmounts mid-Tab and focus falls to <body>,
      // so the Tab never advances to whatever follows the trigger.
      closeAndRestore();
    }
  };
  const triggerElement = trigger as ReactElement<{
    onClick?: (event: ReactMouseEvent<HTMLElement>) => void;
    'aria-expanded'?: boolean;
    'aria-haspopup'?: 'menu';
  }>;
  const enhanced = isValidElement(trigger)
    ? cloneElement(triggerElement, {
        // The trigger keeps whatever it already did; toggling is added on top.
        onClick: (event: ReactMouseEvent<HTMLElement>) => {
          triggerElement.props.onClick?.(event);
          setOpen((value) => !value);
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
      })
    : trigger;
  return (
    <div ref={rootRef} className="relative inline-flex">
      {enhanced}
      {open && (
        <DropdownCloseContext.Provider value={closeAndRestore}>
          <div
            ref={menuRef}
            role="menu"
            onKeyDown={onMenuKeyDown}
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
      tabIndex={-1}
      disabled={disabled}
      onClick={() => {
        onClick?.();
        closeDropdown?.();
      }}
      className={cn(
        'flex min-h-8 w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-[var(--text)] hover:bg-[var(--accent)] hover:text-white focus-visible:bg-[var(--accent)] focus-visible:text-white disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-[var(--text)]',
        active && 'font-semibold',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
