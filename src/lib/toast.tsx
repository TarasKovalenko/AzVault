import {
  Toast,
  ToastBody,
  ToastTitle,
  useToastController,
} from '@fluentui/react-components';

/** Shared toaster id consumed by the single <Toaster> mounted in App. */
export const APP_TOASTER_ID = 'azv-toaster';

type Intent = 'success' | 'error' | 'warning' | 'info';

/**
 * Unified transient-feedback hook. Use instead of ad-hoc inline banners so all
 * non-blocking notifications share one consistent surface, position, and timing.
 */
export function useAppToast() {
  const { dispatchToast } = useToastController(APP_TOASTER_ID);

  const show = (intent: Intent, title: string, body?: string) =>
    dispatchToast(
      <Toast>
        <ToastTitle>{title}</ToastTitle>
        {body ? <ToastBody>{body}</ToastBody> : null}
      </Toast>,
      { intent },
    );

  return {
    success: (title: string, body?: string) => show('success', title, body),
    error: (title: string, body?: string) => show('error', title, body),
    warning: (title: string, body?: string) => show('warning', title, body),
    info: (title: string, body?: string) => show('info', title, body),
  };
}
