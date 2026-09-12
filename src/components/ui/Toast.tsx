import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from './Icon';

type ToastTone = 'success' | 'error' | 'warning' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}
interface ToastApi {
  show: (tone: ToastTone, title: string, body?: string) => void;
}
const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);
  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  const show = useCallback(
    (tone: ToastTone, title: string, body?: string) => {
      const id = Date.now() + Math.random();
      setItems((current) => [...current, { id, tone, title, body }]);
      // Errors carry the detail a user has to read and act on (often a long
      // Azure message), so they stay until dismissed. Everything else is
      // transient feedback and still expires on its own.
      if (tone !== 'error') {
        timers.current.push(window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
      }
    },
    [dismiss],
  );
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) window.clearTimeout(timer);
    };
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[1200] grid w-[340px] gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            // Errors interrupt; the rest wait for a pause in what is being announced.
            role={item.tone === 'error' ? 'alert' : 'status'}
            aria-live={item.tone === 'error' ? 'assertive' : 'polite'}
            className="mac-vibrancy animate-[toast-in_.18s_ease-out] rounded-xl border border-[var(--stroke)] p-3 shadow-[var(--shadow-popover)]"
          >
            <div className="flex gap-2.5">
              <Icon
                name={
                  item.tone === 'success'
                    ? 'check'
                    : item.tone === 'error'
                      ? 'alert'
                      : item.tone === 'warning'
                        ? 'warning'
                        : 'info'
                }
                className={
                  item.tone === 'success'
                    ? 'text-[var(--success)]'
                    : item.tone === 'error'
                      ? 'text-[var(--danger)]'
                      : item.tone === 'warning'
                        ? 'text-[var(--warning)]'
                        : 'text-[var(--accent)]'
                }
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.title}</p>
                {item.body && (
                  <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                    {item.body}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label={`Dismiss ${item.title}`}
                onClick={() => dismiss(item.id)}
                className="-mr-1 -mt-1 grid size-6 shrink-0 place-items-center self-start rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const show = useContext(ToastContext)?.show;
  // Stable across renders so callers can list the toast api in effect deps.
  const api = useMemo(
    () => ({
      success: (title: string, body?: string) => show?.('success', title, body),
      error: (title: string, body?: string) => show?.('error', title, body),
      warning: (title: string, body?: string) => show?.('warning', title, body),
      info: (title: string, body?: string) => show?.('info', title, body),
    }),
    [show],
  );
  if (!show) throw new Error('useToast must be used within ToastProvider');
  return api;
}
