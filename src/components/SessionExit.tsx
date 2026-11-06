"use client";

import { PORTAL_URL, endTrainingAndGoPortal } from "@/lib/portal";

export function SessionExit({
  onStop,
  clearSessionKeys,
  compact,
}: {
  onStop?: () => void;
  clearSessionKeys?: string[];
  compact?: boolean;
}) {
  if (compact) {
    return (
      <a className="btn ghost session-exit-compact" href={PORTAL_URL}>
        ポータル（tr）へ
      </a>
    );
  }

  return (
    <section className="panel session-exit">
      <h2>終了・ポータル</h2>
      <p className="muted">練習を終えたら停止して tr に戻れます。</p>
      <div className="btn-row">
        <button
          type="button"
          className="btn danger"
          onClick={() =>
            endTrainingAndGoPortal({
              stop: onStop,
              clearSessionKeys,
            })
          }
        >
          トレーニングを終了
        </button>
        <a className="btn" href={PORTAL_URL}>
          ポータル（tr）に戻る
        </a>
      </div>
    </section>
  );
}
