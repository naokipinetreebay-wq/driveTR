import { slotsFor } from "./placement";
import { buildPass } from "./path";
import {
  activeCounts,
  type PlayFrame,
  type PlayPackage,
  type RoomConfig,
  type RoomSnapshot,
  type Signal,
} from "./types";

export const CONTROLLER_ID = "controller";

/** 開始時一括。尽きたら端末側でループ */
export const LOCAL_PACKAGE_LAPS = 300;

export type HostOverlay = {
  playPackage: PlayPackage | null;
  controllerSignal: Signal | null;
  activeLine: number | null;
  greens: number[];
  frameStartedAt: number | null;
  signals: Record<string, Signal | null>;
  hostNow: number;
};

/** 全体セット同時表示。各列に緑1・ほか赤 */
export function computeSignals(
  counts: number[],
  greens: number[],
  placeById: Map<number, string>
): Record<string, Signal | null> {
  const signals: Record<string, Signal | null> = {};
  for (const slot of slotsFor(counts)) {
    const greenAt = greens[slot.row - 1] ?? 0;
    const signal: Signal = slot.index === greenAt ? "green" : "red";
    if (slot.controller) {
      signals[CONTROLLER_ID] = signal;
      continue;
    }
    const id = placeById.get(slot.no);
    if (id) signals[id] = signal;
  }
  return signals;
}

export function placeByIdFromSnapshot(snapshot: RoomSnapshot): Map<number, string> {
  const map = new Map<number, string>();
  for (const d of snapshot.displays) map.set(d.place, d.id);
  return map;
}

export function buildLocalPlayPackage(
  snapshot: RoomSnapshot,
  config: RoomConfig,
  opts?: {
    startAt?: number;
    laps?: number;
    rng?: () => number;
  }
): PlayPackage {
  const counts = activeCounts(config);
  const placeById = placeByIdFromSnapshot(snapshot);
  const intervalMs = config.intervalSeconds * 1000;
  const laps = opts?.laps ?? LOCAL_PACKAGE_LAPS;
  const rng = opts?.rng ?? Math.random;
  const frames: PlayFrame[] = [];
  let at = opts?.startAt ?? Date.now();
  for (let lap = 0; lap < laps; lap++) {
    const greens = buildPass(counts, rng);
    frames.push({
      frameStartedAt: at,
      activeLine: 0,
      greens: [...greens],
      signals: computeSignals(counts, greens, placeById),
    });
    at += intervalMs;
  }
  return { intervalMs, frames };
}

export function overlayFromPackage(
  pkg: PlayPackage,
  hostNow = Date.now()
): HostOverlay {
  const first = pkg.frames[0];
  return {
    playPackage: pkg,
    controllerSignal: first?.signals[CONTROLLER_ID] ?? null,
    activeLine: first?.activeLine ?? null,
    greens: first ? [...first.greens] : [],
    frameStartedAt: first?.frameStartedAt ?? null,
    signals: first?.signals ?? {},
    hostNow,
  };
}
