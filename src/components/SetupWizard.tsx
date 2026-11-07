"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { PlacementMap } from "@/components/PlacementMap";
import { SessionExit } from "@/components/SessionExit";
import { slotCaption, slotForPlace } from "@/lib/placement";
import {
  MAX_INTERVAL,
  MIN_INTERVAL,
  activeCounts,
  neededPhones,
  type ClientMessage,
  type RoomConfig,
  type RoomSnapshot,
} from "@/lib/types";

const STEPS = ["説明", "設定", "配置", "確認"] as const;

export function SetupWizard({
  snapshot,
  connected,
  send,
  onDone,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/?code=${snapshot.code}`;
  }, [snapshot.code]);
  const counts = activeCounts(cfg);
  const needed = neededPhones(cfg);
  const joined = snapshot.displays.length;
  const online = snapshot.displays.filter((d) => d.connected).length;
  const roster = online + (connected ? 1 : 0);
  const ready = connected && joined === needed - 1 && online === needed - 1;

  const patch = (partial: Partial<RoomConfig>) => {
    send({ type: "updateConfig", config: partial });
  };

  const setCount = (row: number, value: number) => {
    const next = [...cfg.counts] as [number, number, number];
    next[row] = value;
    patch({ counts: next });
  };

  return (
    <div className="wizard">
      <header className="wizard-top">
        <div>
          <p className="eyebrow">Drive · セットアップ</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className="wizard-top-actions">
          <SessionExit compact />
          <div className={`pill ${connected ? "ok" : "bad"}`}>{connected ? "接続中" : "再接続中…"}</div>
        </div>
      </header>

      <ol className="wizard-steps" aria-label="手順">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
            <span className="n">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className="panel wizard-panel">
        {step === 0 ? (
          <div className="wizard-body">
            <h2>ドライブ</h2>
            <ul className="explain-list">
              <li>端末は手前から1列目、2列目、3列目です。この端末は1列目の左端です。</li>
              <li>1列目から奥へ、緑のすき間をめがけてボールを運ぶ練習です。</li>
              <li>色が出るのは1列だけです。その列の緑が1つ、ほかは赤です。ほかの列は無色です。</li>
              <li>次の緑は、今の緑のとなりだけです。同じ枚数の列では、同じ位置が続きません。</li>
              <li>停止するまで繰り返します。止めると、この端末はメニューに戻り、ほかは無色になります。</li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-body">
            <h2>列と秒数</h2>
            <p className="muted">列は1〜3。各列は2〜4枚です。</p>
            <div className="btn-row">
              {[1, 2, 3].map((lines) => (
                <button
                  key={lines}
                  type="button"
                  className={`btn ${cfg.lines === lines ? "primary" : ""}`}
                  onClick={() => patch({ lines })}
                >
                  {lines}列
                </button>
              ))}
            </div>
            {counts.map((count, row) => (
              <label className="field" key={row}>
                <span>
                  {row + 1}列目: {count}枚
                </span>
                <input
                  type="range"
                  min={2}
                  max={4}
                  step={1}
                  value={count}
                  onChange={(e) => setCount(row, Number(e.target.value))}
                />
              </label>
            ))}
            <label className="field">
              <span>1列の表示: {cfg.intervalSeconds}秒</span>
              <input
                type="range"
                min={MIN_INTERVAL}
                max={MAX_INTERVAL}
                step={1}
                value={cfg.intervalSeconds}
                onChange={(e) => patch({ intervalSeconds: Number(e.target.value) })}
              />
            </label>
            <p className="muted">必要な端末は {needed} 台です。この端末を含みます。</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-body">
            <h2>端末を置く</h2>
            <p className="join-meter">
              接続中 {roster} / {needed} 台
            </p>
            <PlacementMap counts={counts} />
            <div className="qr-wrap">{displayUrl ? <QRCodeSVG value={displayUrl} size={180} /> : null}</div>
            <p className="mono url">{displayUrl}</p>
            <ul className="device-list">
              <li>
                <span className="place-badge">1</span>
                <span>この端末</span>
                <span className="clock-label">{slotCaption({ no: 1, row: 1, index: 0, controller: true })}</span>
              </li>
              {snapshot.displays.map((d) => {
                const slot = slotForPlace(counts, d.place);
                return (
                  <li key={d.id}>
                    <span className="place-badge">{d.place}</span>
                    <input
                      className="label-input"
                      value={d.label}
                      onChange={(e) => send({ type: "setLabel", deviceId: d.id, label: e.target.value })}
                    />
                    <span className="clock-label">{slot ? slotCaption(slot) : "余り"}</span>
                    <span className={`dot ${d.connected ? "ok" : "bad"}`} />
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-body">
            <h2>準備完了</h2>
            <ul className="summary-list">
              <li>
                接続中 {roster} / {needed} 台
              </li>
              <li>{counts.map((count, row) => `${row + 1}列目 ${count}枚`).join("、")}</li>
              <li>{cfg.intervalSeconds}秒ごとに次の列</li>
              <li>各列の緑は1つ。となり以外には進まない</li>
            </ul>
            <p className="muted">「はじめる」で1列目の色が出ます。</p>
          </div>
        ) : null}
      </section>

      <footer className="wizard-nav">
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          戻る
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn primary" disabled={step === 2 && !ready} onClick={() => setStep((s) => s + 1)}>
            {step === 2 && !ready ? `${needed}台そろえてください` : "次へ"}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!ready} onClick={onDone}>
            {ready ? "はじめる" : `${needed}台そろえてください`}
          </button>
        )}
      </footer>
      <SessionExit onStop={() => send({ type: "stop" })} />
    </div>
  );
}
