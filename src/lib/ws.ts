"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CONTROLLER_ID, type HostOverlay } from "./localEngine";
import { LocalMesh, type SignalEnvelope } from "./localMesh";
import type {
  ClientMessage,
  Role,
  RoomSnapshot,
  ServerMessage,
} from "./types";

const PING_MS = 12_000;
const RETRY_BASE_MS = 600;
const RETRY_MAX_MS = 8_000;

/** ルーム参加・シグナリングは Cloudflare。プレー中のゲーム通信は WebRTC。 */
export const TR_ROOMS_HOST = "tr-api.rojiura.app";

function wsUrl(room: string, role: Role, deviceId: string): string {
  const q = new URLSearchParams({ room, role, deviceId, app: "drive" });
  return `wss://${TR_ROOMS_HOST}/ws?${q}`;
}

function mergeOverlay(base: RoomSnapshot, overlay: Partial<HostOverlay>): RoomSnapshot {
  if (!base.config.running) return base;
  const signals = overlay.signals;
  return {
    ...base,
    displays: base.displays.map((d) => ({
      ...d,
      signal: signals && d.id in signals ? (signals[d.id] ?? null) : d.signal,
    })),
    controllerSignal:
      overlay.controllerSignal !== undefined
        ? overlay.controllerSignal
        : signals
          ? (signals[CONTROLLER_ID] ?? null)
          : base.controllerSignal,
    activeLine: overlay.activeLine ?? base.activeLine,
    frameStartedAt: overlay.frameStartedAt ?? base.frameStartedAt,
    playPackage:
      overlay.playPackage !== undefined ? overlay.playPackage : base.playPackage,
    serverNow: overlay.hostNow ?? base.serverNow,
  };
}

/** この snapshot が来たらローカル overlay は捨てる（停止・初期化と同期）。 */
function shouldResetOverlay(snapshot: RoomSnapshot): boolean {
  return !snapshot.config.running;
}

export function useDeviceId(key: string): string {
  const [id, setId] = useState("");
  useEffect(() => {
    const storageKey = `dv-device-${key}`;
    let existing = localStorage.getItem(storageKey);
    if (!existing) {
      existing = crypto.randomUUID();
      localStorage.setItem(storageKey, existing);
    }
    setId(existing);
  }, [key]);
  return id;
}

export function useRoomSocket(room: string, role: Role, deviceId: string) {
  const [baseSnapshot, setBaseSnapshot] = useState<RoomSnapshot | null>(null);
  const [overlay, setOverlay] = useState<Partial<HostOverlay> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [meshReady, setMeshReady] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const meshRef = useRef<LocalMesh | null>(null);
  const clientEventHandlers = useRef(new Set<(ev: ServerMessage) => void>());

  const snapshot = useMemo(() => {
    if (!baseSnapshot) return null;
    if (!overlay) return baseSnapshot;
    return mergeOverlay(baseSnapshot, overlay);
  }, [baseSnapshot, overlay]);

  useEffect(() => {
    if (!room || !deviceId) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    const sendSignal = (env: SignalEnvelope) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(env));
      }
    };

    const mesh = new LocalMesh({
      role,
      deviceId,
      sendSignal,
      onGameMessage: (msg) => {
        const m = msg as ServerMessage | ClientMessage;
        if (m && typeof m === "object" && "type" in m) {
          if (m.type === "hostPush") {
            setOverlay((prev) => ({
              ...(prev ?? {}),
              ...(m.overlay as Partial<HostOverlay>),
            }));
            setMeshReady((n) => n + 1);
            return;
          }
          if (m.type === "clientEvent") {
            for (const h of clientEventHandlers.current) h(m as ServerMessage);
            return;
          }
        }
      },
    });
    meshRef.current = mesh;

    const clearRetry = () => {
      if (retry) {
        clearTimeout(retry);
        retry = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed || retry) return;
      const delay = Math.min(
        RETRY_MAX_MS,
        RETRY_BASE_MS * Math.pow(1.7, attempt) + Math.random() * 200
      );
      attempt += 1;
      retry = setTimeout(() => {
        retry = null;
        connect();
      }, delay);
    };

    const connect = () => {
      if (closed) return;
      clearRetry();
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
      const ws = new WebSocket(wsUrl(room, role, deviceId));
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        setConnected(true);
        setError(null);
        try {
          ws.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
        } catch {
          /* ignore */
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) scheduleReconnect();
      };
      ws.onerror = () => setError("接続エラー");
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(ev.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === "snapshot") {
          const snapshot = msg.snapshot;
          if (shouldResetOverlay(snapshot)) setOverlay(null);
          setBaseSnapshot(snapshot);
          if (role === "controller") {
            for (const d of snapshot.displays) {
              void mesh.ensurePeer(d.id);
            }
          }
        }
        if (msg.type === "signal") {
          void mesh.handleSignal(msg as SignalEnvelope);
        }
        if (msg.type === "clientEvent") {
          for (const h of clientEventHandlers.current) h(msg);
        }
        if (msg.type === "error") setError(msg.message);
        if (msg.type === "pong") setError(null);
      };
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible" || closed) return;
      const state = wsRef.current?.readyState;
      if (state !== WebSocket.OPEN && state !== WebSocket.CONNECTING) {
        connect();
      } else if (state === WebSocket.OPEN) {
        try {
          wsRef.current?.send(
            JSON.stringify({ type: "ping" } satisfies ClientMessage)
          );
        } catch {
          /* ignore */
        }
      }
    };

    connect();
    ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(
            JSON.stringify({ type: "ping" } satisfies ClientMessage)
          );
        } catch {
          /* ignore */
        }
      } else if (!closed) {
        scheduleReconnect();
      }
    }, PING_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);

    return () => {
      closed = true;
      clearRetry();
      if (ping) clearInterval(ping);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
      mesh.destroy();
      meshRef.current = null;
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, [room, role, deviceId]);

  const send = useCallback((msg: ClientMessage) => {
    const mesh = meshRef.current;
    // プレー配信は WebRTC 優先（これがローカル化）。未接続ピア向けに WS も送る。
    if (msg.type === "hostPush") {
      setOverlay((prev) => ({
        ...(prev ?? {}),
        ...(msg.overlay as Partial<HostOverlay>),
      }));
      mesh?.broadcastGame(msg);
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const sendGame = useCallback((msg: unknown) => {
    const mesh = meshRef.current;
    if (role === "display") {
      if (mesh?.sendGameToController(msg)) return true;
    } else if (mesh?.broadcastGame(msg)) {
      return true;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, [role]);

  const onClientEvent = useCallback((handler: (ev: ServerMessage) => void) => {
    clientEventHandlers.current.add(handler);
    return () => {
      clientEventHandlers.current.delete(handler);
    };
  }, []);

  return {
    snapshot,
    error,
    connected,
    send,
    sendGame,
    onClientEvent,
    meshPeers: meshReady,
  };
}

export async function createRoom(): Promise<string> {
  const res = await fetch(`https://${TR_ROOMS_HOST}/v1/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app: "drive" }),
  });
  if (!res.ok) throw new Error("ルーム作成に失敗しました");
  const data = (await res.json()) as { code: string };
  return data.code;
}
