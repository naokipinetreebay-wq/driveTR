export type Role = "controller" | "display";
export type Signal = "red" | "green";

export interface RoomConfig {
  /** 使う列の数。1〜3 */
  lines: number;
  /** 各列の枚数。2〜4。lines 以降は使わない */
  counts: [number, number, number];
  /** 1列を出しておく秒数。2〜10 */
  intervalSeconds: number;
  running: boolean;
}

export interface DisplayInfo {
  id: string;
  label: string;
  /** 2が参加順の1台目。1はコントローラ */
  place: number;
  connected: boolean;
  signal: Signal | null;
}

/** 開始時に一度配り、端末時計で再生する出題一式 */
export interface PlayFrame {
  frameStartedAt: number;
  activeLine: number;
  greens: number[];
  /** 端末 id → 信号。コントローラは "controller" */
  signals: Record<string, Signal | null>;
}

export interface PlayPackage {
  intervalMs: number;
  frames: PlayFrame[];
}

export interface RoomSnapshot {
  code: string;
  config: RoomConfig;
  displays: DisplayInfo[];
  controllerSignal: Signal | null;
  /** 今、色を出している列。0が1列目 */
  activeLine: number | null;
  frameStartedAt: number | null;
  /** あるときは端末側再生の正本 */
  playPackage: PlayPackage | null;
  serverNow: number;
}

export type ClientMessage =
  | { type: "hello"; role: Role; deviceId: string; label?: string }
  | { type: "updateConfig"; config: Partial<RoomConfig> }
  | { type: "setLabel"; deviceId: string; label: string }
  | { type: "start"; local?: boolean }
  | { type: "stop" }
  | {
      type: "hostPush";
      overlay: {
        playPackage?: PlayPackage | null;
        controllerSignal?: Signal | null;
        activeLine?: number | null;
        greens?: number[];
        frameStartedAt?: number | null;
        signals?: Record<string, Signal | null>;
        hostNow?: number;
      };
    }
  | { type: "ping" };

export type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | { type: "error"; message: string }
  | { type: "pong" };

export const DEFAULT_CONFIG: RoomConfig = {
  lines: 3,
  counts: [2, 2, 2],
  intervalSeconds: 4,
  running: false,
};

export const MAX_PERIPHERALS = 11;
export const MIN_INTERVAL = 2;
export const MAX_INTERVAL = 10;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function activeCounts(config: Pick<RoomConfig, "lines" | "counts">): number[] {
  const lines = clamp(Math.round(config.lines), 1, 3);
  return config.counts.slice(0, lines).map((count) => clamp(Math.round(count), 2, 4));
}

export function neededPhones(config: Pick<RoomConfig, "lines" | "counts">): number {
  return activeCounts(config).reduce((sum, count) => sum + count, 0);
}
