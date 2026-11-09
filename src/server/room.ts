import { WebSocket } from "ws";
import { slotsFor } from "../lib/placement";
import { buildPass } from "../lib/path";
import {
  DEFAULT_CONFIG,
  MAX_INTERVAL,
  MAX_PERIPHERALS,
  MIN_INTERVAL,
  activeCounts,
  clamp,
  neededPhones,
  type DisplayInfo,
  type PlayFrame,
  type PlayPackage,
  type RoomConfig,
  type RoomSnapshot,
  type Signal,
} from "../lib/types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 90 * 60 * 1000;
const CONTROLLER_ID = "controller";
const PACKAGE_LAPS = 12;

function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export type ClientSocket = WebSocket & {
  role?: "controller" | "display";
  deviceId?: string;
  roomCode?: string;
};

interface DisplayClient {
  id: string;
  label: string;
  place: number;
  socket: ClientSocket | null;
}

export class Room {
  code: string;
  config: RoomConfig = { ...DEFAULT_CONFIG, counts: [...DEFAULT_CONFIG.counts] };
  displays = new Map<string, DisplayClient>();
  controllers = new Set<ClientSocket>();
  controllerSignal: Signal | null = null;
  activeLine: number | null = null;
  greens: number[] = [];
  frameStartedAt: number | null = null;
  playPackage: PlayPackage | null = null;
  localHost = true;
  hostOverlay: {
    playPackage?: PlayPackage | null;
    controllerSignal?: Signal | null;
    activeLine?: number | null;
    greens?: number[];
    frameStartedAt?: number | null;
    signals?: Record<string, Signal | null>;
    hostNow?: number;
  } | null = null;
  lastActivity = Date.now();
  rng: () => number = Math.random;

  private signals = new Map<string, Signal | null>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private counts: number[] = [];
  private packageIndex = 0;

  constructor(code: string) {
    this.code = code;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  isExpired(now = Date.now()) {
    if (this.config.running) return false;
    if (this.controllers.size > 0) return false;
    if ([...this.displays.values()].some((d) => d.socket)) return false;
    return now - this.lastActivity > ROOM_TTL_MS;
  }

  addController(socket: ClientSocket) {
    this.controllers.add(socket);
    this.touch();
    this.sendSnapshot(socket);
  }

  removeController(socket: ClientSocket) {
    this.controllers.delete(socket);
  }

  addDisplay(socket: ClientSocket, deviceId: string, label?: string) {
    this.touch();
    const existing = this.displays.get(deviceId);
    if (existing) {
      existing.socket = socket;
      if (label) existing.label = label;
      this.broadcast();
      return { ok: true as const };
    }
    if (this.displays.size >= MAX_PERIPHERALS) {
      return { ok: false as const, error: "周囲の端末は11台までです" };
    }
    const place = this.displays.size + 2;
    this.displays.set(deviceId, {
      id: deviceId,
      label: label || `No.${place}`,
      place,
      socket,
    });
    this.broadcast();
    return { ok: true as const };
  }

  removeDisplaySocket(socket: ClientSocket) {
    for (const d of this.displays.values()) {
      if (d.socket === socket) {
        d.socket = null;
        break;
      }
    }
    this.broadcast();
  }

  setLabel(deviceId: string, label: string) {
    const d = this.displays.get(deviceId);
    if (d) {
      d.label = label.slice(0, 24);
      this.touch();
      this.broadcast();
    }
  }

  updateConfig(partial: Partial<RoomConfig>) {
    if (this.config.running) {
      this.broadcast();
      return;
    }
    const counts = partial.counts ? [...partial.counts] : [...this.config.counts];
    while (counts.length < 3) counts.push(2);
    const next: RoomConfig = {
      ...this.config,
      ...partial,
      running: false,
      lines: clamp(Math.round(partial.lines ?? this.config.lines), 1, 3),
      counts: [
        clamp(Math.round(counts[0] ?? 2), 2, 4),
        clamp(Math.round(counts[1] ?? 2), 2, 4),
        clamp(Math.round(counts[2] ?? 2), 2, 4),
      ],
      intervalSeconds: clamp(Math.round(partial.intervalSeconds ?? this.config.intervalSeconds), MIN_INTERVAL, MAX_INTERVAL),
    };
    this.config = next;
    this.touch();
    this.broadcast();
  }

  private connectedCount(): number {
    return [...this.displays.values()].filter((d) => d.socket && d.socket.readyState === WebSocket.OPEN).length;
  }

  private hasController(): boolean {
    return [...this.controllers].some((socket) => socket.readyState === WebSocket.OPEN);
  }

  start(local = true) {
    const needed = neededPhones(this.config);
    if (!this.hasController() || this.connectedCount() !== needed - 1 || this.displays.size !== needed - 1) {
      this.broadcast();
      return;
    }
    this.clearTimer();
    this.counts = activeCounts(this.config);
    this.config.running = true;
    this.localHost = local !== false;
    this.packageIndex = 0;
    this.playPackage = null;
    this.hostOverlay = null;
    this.controllerSignal = null;
    this.activeLine = null;
    this.greens = [];
    this.signals.clear();
    this.frameStartedAt = null;
    this.touch();
    if (!this.localHost) {
      this.playPackage = {
        intervalMs: this.config.intervalSeconds * 1000,
        frames: this.buildFrames(Date.now(), PACKAGE_LAPS),
      };
      const first = this.playPackage.frames[0];
      if (!first) {
        this.stop();
        return;
      }
      this.applyFrame(first);
      this.armPackage();
    }
    this.broadcast();
  }

  stop() {
    this.clearTimer();
    this.config.running = false;
    this.controllerSignal = null;
    this.activeLine = null;
    this.greens = [];
    this.signals.clear();
    this.frameStartedAt = null;
    this.playPackage = null;
    this.packageIndex = 0;
    this.hostOverlay = null;
    this.touch();
    this.broadcast();
  }

  hostPush(overlay: NonNullable<Room["hostOverlay"]>) {
    this.hostOverlay = { ...(this.hostOverlay || {}), ...overlay };
    if (overlay.playPackage !== undefined) this.playPackage = overlay.playPackage;
    if (overlay.signals) {
      this.signals.clear();
      this.controllerSignal = overlay.signals[CONTROLLER_ID] ?? null;
      for (const [id, signal] of Object.entries(overlay.signals)) {
        if (id === CONTROLLER_ID) continue;
        this.signals.set(id, signal);
      }
    }
    if (overlay.activeLine !== undefined) this.activeLine = overlay.activeLine;
    if (overlay.greens) this.greens = [...overlay.greens];
    if (overlay.frameStartedAt !== undefined) this.frameStartedAt = overlay.frameStartedAt;
    this.touch();
    this.broadcast();
  }

  /** 全体セット同時表示。各列に緑1・ほか赤 */
  private computeSignals(greens: number[]): Record<string, Signal | null> {
    const signals: Record<string, Signal | null> = {};
    for (const slot of slotsFor(this.counts)) {
      const greenAt = greens[slot.row - 1] ?? 0;
      const signal: Signal = slot.index === greenAt ? "green" : "red";
      if (slot.controller) {
        signals[CONTROLLER_ID] = signal;
        continue;
      }
      const display = [...this.displays.values()].find((d) => d.place === slot.no);
      if (display) signals[display.id] = signal;
    }
    return signals;
  }

  private buildFrames(startAt: number, laps: number): PlayFrame[] {
    const intervalMs = this.config.intervalSeconds * 1000;
    const frames: PlayFrame[] = [];
    let at = startAt;
    for (let lap = 0; lap < laps; lap++) {
      const greens = buildPass(this.counts, this.rng);
      frames.push({
        frameStartedAt: at,
        activeLine: 0,
        greens: [...greens],
        signals: this.computeSignals(greens),
      });
      at += intervalMs;
    }
    return frames;
  }

  private applyFrame(frame: PlayFrame) {
    this.activeLine = frame.activeLine;
    this.greens = [...frame.greens];
    this.frameStartedAt = frame.frameStartedAt;
    this.signals.clear();
    this.controllerSignal = frame.signals[CONTROLLER_ID] ?? null;
    for (const [id, signal] of Object.entries(frame.signals)) {
      if (id === CONTROLLER_ID) continue;
      this.signals.set(id, signal);
    }
  }

  private armPackage() {
    this.clearTimer();
    if (!this.config.running || !this.playPackage) return;
    const nextIndex = this.packageIndex + 1;
    if (nextIndex >= this.playPackage.frames.length) {
      const last = this.playPackage.frames[this.playPackage.frames.length - 1];
      const more = this.buildFrames(
        last.frameStartedAt + this.playPackage.intervalMs,
        PACKAGE_LAPS
      );
      const kept = this.playPackage.frames.slice(-this.counts.length);
      this.playPackage = {
        intervalMs: this.playPackage.intervalMs,
        frames: [...kept, ...more],
      };
      this.packageIndex = Math.max(0, kept.length - 1);
    }
    const next = this.playPackage.frames[this.packageIndex + 1];
    if (!next) return;
    const wait = Math.max(0, next.frameStartedAt - Date.now());
    this.timer = setTimeout(() => {
      if (!this.config.running || !this.playPackage) return;
      this.packageIndex += 1;
      const frame = this.playPackage.frames[this.packageIndex];
      if (!frame) return;
      this.applyFrame(frame);
      this.armPackage();
      this.broadcast();
    }, wait);
  }

  nextLine() {
    if (!this.config.running || !this.playPackage) return;
    this.clearTimer();
    const nextIndex = this.packageIndex + 1;
    if (nextIndex >= this.playPackage.frames.length) {
      const last = this.playPackage.frames[this.playPackage.frames.length - 1];
      const more = this.buildFrames(
        Date.now(),
        PACKAGE_LAPS
      );
      this.playPackage = {
        intervalMs: this.playPackage.intervalMs,
        frames: more,
      };
      this.packageIndex = 0;
      this.applyFrame(more[0]);
      this.armPackage();
      this.broadcast();
      void last;
      return;
    }
    this.packageIndex = nextIndex;
    this.applyFrame(this.playPackage.frames[nextIndex]);
    this.armPackage();
    this.broadcast();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  snapshot(): RoomSnapshot {
    const host = this.hostOverlay;
    const running = this.config.running;
    const displays: DisplayInfo[] = [...this.displays.values()].map((d) => ({
      id: d.id,
      label: d.label,
      place: d.place,
      connected: !!d.socket && d.socket.readyState === WebSocket.OPEN,
      signal: running
        ? (host?.signals?.[d.id] ?? this.signals.get(d.id) ?? null)
        : null,
    }));
    return {
      code: this.code,
      config: this.config,
      displays,
      controllerSignal: running
        ? host?.controllerSignal !== undefined
          ? host.controllerSignal
          : this.controllerSignal
        : null,
      activeLine: running ? (host?.activeLine ?? this.activeLine) : null,
      frameStartedAt: running ? (host?.frameStartedAt ?? this.frameStartedAt) : null,
      playPackage: running
        ? host?.playPackage !== undefined
          ? host.playPackage
          : this.playPackage
        : null,
      serverNow: host?.hostNow ?? Date.now(),
    };
  }

  sendSnapshot(socket: ClientSocket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "snapshot", snapshot: this.snapshot() }));
    }
  }

  broadcast() {
    const payload = JSON.stringify({ type: "snapshot", snapshot: this.snapshot() });
    for (const c of this.controllers) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
    for (const d of this.displays.values()) {
      if (d.socket && d.socket.readyState === WebSocket.OPEN) d.socket.send(payload);
    }
  }

  destroy() {
    this.clearTimer();
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (room?.isExpired()) {
      room.destroy();
      this.rooms.delete(room.code);
      return undefined;
    }
    return room;
  }

  sweep() {
    for (const [code, room] of this.rooms) {
      if (room.isExpired()) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}
