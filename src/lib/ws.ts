"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, Role, RoomSnapshot, ServerMessage } from "./types";

const PING_MS = 12_000;
const RETRY_BASE_MS = 600;
const RETRY_MAX_MS = 8_000;

/** ルーム／WS は Cloudflare（tr-api）。UI は Pages（tr.rojiura.app）。 */
export const TR_ROOMS_HOST = "tr-api.rojiura.app";

function wsUrl(room: string, role: Role, deviceId: string): string {
  const q = new URLSearchParams({ room, role, deviceId, app: "drive" });
  return `wss://${TR_ROOMS_HOST}/ws?${q}`;
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
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!room || !deviceId) return;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let ping: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

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
        if (msg.type === "snapshot") setSnapshot(msg.snapshot);
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
          wsRef.current?.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
        } catch {
          /* ignore */
        }
      }
    };

    connect();
    ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: "ping" } satisfies ClientMessage));
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
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, [room, role, deviceId]);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { snapshot, error, connected, send };
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
