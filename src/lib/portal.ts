export const PORTAL_URL = "https://tr.rojiura.app";

/** Stop training (optional) and leave for the TRwebapp portal. */
export function endTrainingAndGoPortal(opts?: {
  stop?: () => void;
  clearSessionKeys?: string[];
}) {
  if (
    typeof window !== "undefined" &&
    !window.confirm("トレーニングを終了してポータル（tr）に戻りますか？")
  ) {
    return;
  }
  try {
    opts?.stop?.();
  } catch {
    /* ignore */
  }
  try {
    for (const key of opts?.clearSessionKeys ?? []) {
      sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
  window.location.href = PORTAL_URL;
}
