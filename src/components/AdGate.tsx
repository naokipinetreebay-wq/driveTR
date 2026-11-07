"use client";

import { useState } from "react";
import {
  addSkipDebt,
  markAdSeen,
  repaySkipDebt,
  type TrBootstrapResponse,
  type TrCreative,
} from "@/lib/trApi";

export function AdGate({
  bootstrap,
  onDone,
}: {
  bootstrap: TrBootstrapResponse;
  onDone: () => void;
}) {
  const creatives = bootstrap.ad.creatives.slice(0, Math.max(1, bootstrap.ad.count));
  const [index, setIndex] = useState(0);
  const current = creatives[index] as TrCreative | undefined;

  const finishOne = (skipped: boolean) => {
    if (skipped) addSkipDebt(1);
    else {
      markAdSeen();
      repaySkipDebt(1);
    }
    if (index + 1 >= creatives.length) {
      if (!skipped) markAdSeen();
      onDone();
      return;
    }
    setIndex(index + 1);
  };

  if (!current) {
    onDone();
    return null;
  }

  return (
    <main className="home">
      <div className="home-card">
        <p className="eyebrow">お知らせ</p>
        <h1>{current.title}</h1>
        <p className="muted">
          部屋を作る前に、約{current.durationSeconds}秒の案内です。急ぐ場合はスキップできます（あとでまとめて見てもらいます）。
        </p>
        {current.mediaUrl ? (
          <video
            key={current.mediaUrl + index}
            className="ad-video"
            src={current.mediaUrl}
            controls
            playsInline
            autoPlay
            preload="metadata"
            onEnded={() => finishOne(false)}
          />
        ) : null}
        <div className="home-actions">
          <a className="btn primary" href={current.url} target="_blank" rel="noreferrer">
            GameChopを見る
          </a>
          <button type="button" className="btn primary" onClick={() => finishOne(false)}>
            見た・次へ
          </button>
          {current.skippable ? (
            <button type="button" className="btn" onClick={() => finishOne(true)}>
              スキップ
            </button>
          ) : null}
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          {index + 1} / {creatives.length}
        </p>
      </div>
    </main>
  );
}
