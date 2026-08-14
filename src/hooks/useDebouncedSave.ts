import { useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useDebouncedSave(delayMs = 600) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown> | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    try {
      await invoke("save_config", payload as Record<string, unknown>);
    } catch {
      // silent — persistence must never block the UI
    }
  }, []);

  const schedule = useCallback(
    (payload: Record<string, unknown>) => {
      pendingRef.current = { ...(pendingRef.current ?? {}), ...payload };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [delayMs, flush]
  );

  return { schedule, flush };
}
