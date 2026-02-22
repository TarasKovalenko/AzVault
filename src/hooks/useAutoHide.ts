import { useCallback, useEffect, useRef, useState } from 'react';

interface UseAutoHideOptions {
  timeoutSeconds: number;
  onHide?: () => void;
}

export function useAutoHide({ timeoutSeconds, onHide }: UseAutoHideOptions) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    timerRef.current = null;
    hideTimeoutRef.current = null;
  }, []);

  const reveal = useCallback(() => {
    clearTimers();
    setIsRevealed(true);
    setSecondsLeft(timeoutSeconds);

    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) return 0;
        return s - 1;
      });
    }, 1000);

    hideTimeoutRef.current = setTimeout(() => {
      setIsRevealed(false);
      setSecondsLeft(0);
      clearTimers();
      onHide?.();
    }, timeoutSeconds * 1000);
  }, [timeoutSeconds, onHide, clearTimers]);

  const hide = useCallback(() => {
    clearTimers();
    setIsRevealed(false);
    setSecondsLeft(0);
  }, [clearTimers]);

  const toggle = useCallback(() => {
    if (isRevealed) hide();
    else reveal();
  }, [isRevealed, hide, reveal]);

  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  return { isRevealed, secondsLeft, reveal, hide, toggle };
}
