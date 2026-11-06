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
  type RoomConfig,
  type RoomSnapshot,
  type Signal,
} from "../lib/types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 90 * 60 * 1000;

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
  lastActivity = Date.now();
  rng: () => number = Math.random;

  private signals = new Map<string, Signal | null>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private counts: number[] = [];

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

  start() {
    const needed = neededPhones(this.config);
    if (!this.hasController() || this.connectedCount() !== needed - 1 || this.displays.size !== needed - 1) {
      this.broadcast();
      return;
    }
    this.clearTimer();
    this.counts = activeCounts(this.config);
    this.greens = buildPass(this.counts, this.rng);
    this.activeLine = 0;
    this.config.running = true;
    this.touch();
    this.showLine(Date.now());
  }

  stop() {
    this.clearTimer();
    this.config.running = false;
    this.controllerSignal = null;
    this.activeLine = null;
    this.greens = [];
    this.signals.clear();
    this.frameStartedAt = null;
    this.touch();
    this.broadcast();
  }

  private showLine(at: number) {
    const line = this.activeLine ?? 0;
    const greenAt = this.greens[line] ?? 0;
    this.signals.clear();
    this.controllerSignal = null;
    for (const slot of slotsFor(this.counts)) {
      const signal: Signal | null =
        slot.row === line + 1 ? (slot.index === greenAt ? "green" : "red") : null;
      if (slot.controller) {
        this.controllerSignal = signal;
        continue;
      }
      const display = [...this.displays.values()].find((d) => d.place === slot.no);
      if (display) this.signals.set(display.id, signal);
    }
    this.frameStartedAt = at;
    this.broadcast();
    const wait = Math.max(0, at + this.config.intervalSeconds * 1000 - Date.now());
    this.timer = setTimeout(() => this.nextLine(), wait);
  }

  nextLine() {
    if (!this.config.running) return;
    this.clearTimer();
    const next = (this.activeLine ?? 0) + 1;
    if (next >= this.counts.length) {
      this.greens = buildPass(this.counts, this.rng);
      this.activeLine = 0;
    } else {
      this.activeLine = next;
    }
    this.showLine(Date.now());
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  snapshot(): RoomSnapshot {
    const displays: DisplayInfo[] = [...this.displays.values()].map((d) => ({
      id: d.id,
      label: d.label,
      place: d.place,
      connected: !!d.socket && d.socket.readyState === WebSocket.OPEN,
      signal: this.config.running ? (this.signals.get(d.id) ?? null) : null,
    }));
    return {
      code: this.code,
      config: this.config,
      displays,
      controllerSignal: this.config.running ? this.controllerSignal : null,
      activeLine: this.config.running ? this.activeLine : null,
      frameStartedAt: this.config.running ? this.frameStartedAt : null,
      serverNow: Date.now(),
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
