import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((tone: ToastTone, title: string, body?: string) => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, tone, title, body }]);
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 4000);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-5 right-5 z-[1200] grid w-[340px] gap-2">
        {items.map((item) => (
          <div
            key={item.id}
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
              <div>
                <p className="font-semibold">{item.title}</p>
                {item.body && (
                  <p className="mt-0.5 text-xs leading-5 text-[var(--text-secondary)]">
                    {item.body}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return {
    success: (title: string, body?: string) => context.show('success', title, body),
    error: (title: string, body?: string) => context.show('error', title, body),
    warning: (title: string, body?: string) => context.show('warning', title, body),
    info: (title: string, body?: string) => context.show('info', title, body),
  };
}
