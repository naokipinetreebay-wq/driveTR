"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  buildLocalPlayPackage,
  overlayFromPackage,
  type HostOverlay,
} from "./localEngine";
import type { ClientMessage, RoomSnapshot } from "./types";

const CLOCK_MS = 3000;

export function useDriveLocalHost(
  snapshot: RoomSnapshot | null,
  send: (msg: ClientMessage) => void
) {
  const overlayRef = useRef<HostOverlay | null>(null);

  const push = useCallback(
    (overlay: HostOverlay) => {
      overlayRef.current = overlay;
      send({ type: "hostPush", overlay });
    },
    [send]
  );

  useEffect(() => {
    if (!snapshot?.config.running) return;
    const tick = () => {
      const prev = overlayRef.current;
      if (!prev) return;
      push({ ...prev, hostNow: Date.now() });
    };
    const id = setInterval(tick, CLOCK_MS);
    return () => clearInterval(id);
  }, [snapshot?.config.running, push]);

  const startLocal = useCallback(() => {
    if (!snapshot) return;
    send({ type: "start", local: true });
    const pkg = buildLocalPlayPackage(snapshot, snapshot.config);
    push(overlayFromPackage(pkg));
  }, [snapshot, send, push]);

  const stopLocal = useCallback(() => {
    overlayRef.current = null;
    send({ type: "stop" });
  }, [send]);

  return { startLocal, stopLocal };
}
