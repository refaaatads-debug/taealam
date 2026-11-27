/**
 * Poll only while the tab is visible. Realtime stays the primary update path;
 * this is a safety net, so it runs less often and never in background tabs.
 * Returns a cleanup function.
 */
export function pollWhenVisible(fn: () => void, intervalMs: number): () => void {
  const id = window.setInterval(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    fn();
  }, intervalMs);
  const onVisible = () => {
    if (!document.hidden) fn();
  };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
