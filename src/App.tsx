import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppLayout } from './components/app/AppLayout';
import { SignIn } from './components/auth/SignIn';
import { ToastProvider } from './components/ui/Toast';
import { queryClient } from './lib/queryClient';
import { useAppStore } from './stores/appStore';

export default function App() {
  const isSignedIn = useAppStore((state) => state.isSignedIn);
  const themeMode = useAppStore((state) => state.themeMode);

  useEffect(() => {
    document.body.dataset.theme = themeMode;
  }, [themeMode]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{isSignedIn ? <AppLayout /> : <SignIn />}</ToastProvider>
    </QueryClientProvider>
  );
}
