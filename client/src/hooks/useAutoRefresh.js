import { useEffect, useRef } from 'react';

// Polls `callback` on an interval without ever showing a loading state — callers
// are expected to pass a fetch function that skips setLoading(true) when called
// this way. Paused while the tab is hidden or `enabled` is false (e.g. a modal
// is open), so an in-progress edit never gets its underlying data replaced.
export default function useAutoRefresh(callback, { intervalMs = 5000, enabled = true } = {}) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
      }
    }, intervalMs);

    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
