"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";
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

export function ControllerPanel({
  snapshot,
  connected,
  send,
  clearSessionKeys,
  onStart,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  clearSessionKeys?: string[];
  onStart: () => void;
}) {
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/${snapshot.code}`;
  }, [snapshot.code]);
  const counts = activeCounts(cfg);
  const needed = neededPhones(cfg);
  const online = snapshot.displays.filter((d) => d.connected).length;
  const ready = connected && online === needed - 1 && snapshot.displays.length === needed - 1;

  const patch = (partial: Partial<RoomConfig>) => {
    if (cfg.running) return;
    send({ type: "updateConfig", config: partial });
  };

  const setCount = (row: number, value: number) => {
    const next = [...cfg.counts] as [number, number, number];
    next[row] = value;
    patch({ counts: next });
  };

  return (
    <div className="controller">
      <header className="controller-header">
        <div>
          <p className="eyebrow">Drive</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className={`pill ${connected ? "ok" : "bad"}`}>{connected ? "接続中" : "再接続中…"}</div>
      </header>

      <section className="panel">
        <h2>{cfg.running ? "練習中" : "待機"}</h2>
        <p className="time-read">
          {cfg.intervalSeconds}
          <span className="score-denom">秒</span>
        </p>
        <p className="muted">緑のすき間をめがけて、手前の列から奥へボールを運びます。赤は通れません。</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn primary"
            disabled={!ready || cfg.running}
            onClick={() => {
              send({ type: "start" });
              onStart();
            }}
          >
            開始
          </button>
          <button type="button" className="btn danger" onClick={() => send({ type: "stop" })}>
            停止
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>設定</h2>
        <div className="btn-row">
          {[1, 2, 3].map((lines) => (
            <button
              key={lines}
              type="button"
              className={`btn ${cfg.lines === lines ? "primary" : ""}`}
              disabled={cfg.running}
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
              disabled={cfg.running}
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
            disabled={cfg.running}
            onChange={(e) => patch({ intervalSeconds: Number(e.target.value) })}
          />
        </label>
        <p className="muted">{ready ? "停止するまで繰り返します。" : `この端末を含めて ${needed} 台必要です。`}</p>
      </section>

      <section className="panel">
        <h2>端末</h2>
        <div className="qr-wrap">{displayUrl ? <QRCodeSVG value={displayUrl} size={160} /> : null}</div>
        <p className="mono url">{displayUrl}</p>
        <ul className="device-list">
          <li>
            <span className="place-badge">1</span>
            <span>この端末</span>
            <span className="clock-label">1列目・左から1</span>
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
      </section>

      <SessionExit onStop={() => send({ type: "stop" })} clearSessionKeys={clearSessionKeys} />
    </div>
  );
}
