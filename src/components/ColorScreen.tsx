"use client";

import { useEffect, useRef } from "react";
import type { Signal } from "@/lib/types";

function buzz(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = 150;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.18, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.5);
}

export function ColorScreen({
  signal,
  title,
  detail,
  sound,
  frameStartedAt,
  running,
  onStop,
}: {
  signal: Signal | null;
  title: string;
  detail?: string;
  sound: boolean;
  frameStartedAt: number | null;
  running: boolean;
  onStop?: () => void;
}) {
  const ctxRef = useRef<AudioContext | null>(null);
  const playedRef = useRef<number | null>(null);

  const unlock = () => {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!ctxRef.current) ctxRef.current = new AudioCtx();
    void ctxRef.current.resume();
  };

  useEffect(() => {
    if (!running || !sound || signal !== "red" || frameStartedAt == null) return;
    if (playedRef.current === frameStartedAt) return;
    playedRef.current = frameStartedAt;
    unlock();
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "running") buzz(ctx);
  }, [frameStartedAt, running, signal, sound]);

  const colored = running && signal != null;

  return (
    <div
      className={`color-screen ${colored ? signal : ""}`}
      onPointerDown={unlock}
    >
      {colored ? null : (
        <span className="peri-wait">
          <span className="peri-wait-no">{title}</span>
          {detail ? <span className="peri-wait-clock">{detail}</span> : null}
          {sound ? <span className="peri-wait-clock">音を出すには一度タップ</span> : null}
        </span>
      )}
      {onStop && running ? (
        <button type="button" className="saccade-back" onClick={onStop}>
          停止
        </button>
      ) : null}
    </div>
  );
}
