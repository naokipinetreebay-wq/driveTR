"use client";

import { useEffect, useRef, useState } from "react";
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
  doneLabel = "ルームを作成",
  busy = false,
  error = null,
}: {
  bootstrap: TrBootstrapResponse;
  onDone: () => void;
  doneLabel?: string;
  busy?: boolean;
  error?: string | null;
}) {
  const creatives = bootstrap.ad.creatives.slice(0, Math.max(1, bootstrap.ad.count));
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"prompt" | "playing" | "thanks">("prompt");
  const [muted, setMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const current = creatives[index] as TrCreative | undefined;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || phase !== "playing") return;
    el.muted = muted;
    if (!muted) {
      void el.play().catch(() => {
        /* 自動再生が拒否された場合はコントロールから再生 */
      });
    }
  }, [muted, phase, index]);

  const finishOne = (skipped: boolean) => {
    if (skipped) addSkipDebt(1);
    else {
      markAdSeen();
      repaySkipDebt(1);
    }
    if (index + 1 >= creatives.length) {
      if (!skipped) markAdSeen();
      setPhase("thanks");
      return;
    }
    setIndex(index + 1);
    setPhase("prompt");
    setMuted(true);
  };

  const thanksCard = (creative?: TrCreative) => (
    <main className="home">
      <div className="home-card">
        <p className="eyebrow">広告</p>
        <h1>ありがとうございました</h1>
        <p className="muted">ご視聴ありがとうございます。準備ができたらルームを作成してください。</p>
        {creative?.mediaUrl ? (
          <div className="ad-video-wrap">
            <video
              className="ad-video"
              src={creative.mediaUrl}
              playsInline
              muted
              preload="metadata"
            />
            {creative.url ? (
              <div className="ad-audio-row">
                <a className="ad-video-hit" href={creative.url} target="_blank" rel="noreferrer">
                  詳細（{creative.title}）
                </a>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="home-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={onDone}>
            {busy ? "作成中…" : doneLabel}
          </button>
        </div>
        {error ? (
          <p className="muted" style={{ marginTop: 12, color: "var(--bad)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );

  if (!current) {
    return thanksCard();
  }

  if (phase === "thanks") {
    return thanksCard(current);
  }

  if (phase === "prompt") {
    return (
      <main className="home">
        <div className="home-card">
          <p className="eyebrow">短いお知らせ</p>
          <h1>続けるには短い広告を見てください</h1>
          <p className="muted">
            約{current.durationSeconds}秒です。最初は消音で流れます。音が必要なときは画面の「音を出す」からオンにできます。
          </p>
          <div className="home-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                setMuted(true);
                setPhase("playing");
              }}
            >
              広告を見る
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

  return (
    <main className="home">
      <div className="home-card">
        <p className="eyebrow">広告</p>
        <h1>{current.title}</h1>
        <p className="muted">
          消音で再生しています。音量は下のボタンか、動画のコントロールから変えられます。
        </p>
        {current.mediaUrl ? (
          <div className="ad-video-wrap">
            <video
              ref={videoRef}
              key={current.mediaUrl + index}
              className="ad-video"
              src={current.mediaUrl}
              controls
              playsInline
              autoPlay
              muted={muted}
              preload="auto"
              onEnded={() => finishOne(false)}
            />
            <div className="ad-audio-row">
              <button
                type="button"
                className="btn"
                onClick={() => setMuted((v) => !v)}
              >
                {muted ? "音を出す" : "消音にする"}
              </button>
              {current.url ? (
                <a className="ad-video-hit" href={current.url} target="_blank" rel="noreferrer">
                  詳細（{current.title}）
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="home-actions">
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
