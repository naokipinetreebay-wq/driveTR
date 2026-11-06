"use client";

import { useEffect } from "react";
import { ColorScreen } from "@/components/ColorScreen";
import { slotCaption, slotForPlace } from "@/lib/placement";
import { activeCounts, type RoomSnapshot } from "@/lib/types";

export function DisplayScreen({ snapshot, deviceId }: { snapshot: RoomSnapshot; deviceId: string; send?: unknown }) {
  const mine = snapshot.displays.find((d) => d.id === deviceId);
  const slot = slotForPlace(activeCounts(snapshot.config), mine?.place ?? 0);

  useEffect(() => {
    let wake: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) wake = await navigator.wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wake?.release().catch(() => undefined);
    };
  }, []);

  return (
    <ColorScreen
      signal={mine?.signal ?? null}
      title={mine?.label || `No.${mine?.place ?? ""}`}
      detail={slot ? slotCaption(slot) : ""}
      sound={false}
      frameStartedAt={snapshot.frameStartedAt}
      running={snapshot.config.running}
    />
  );
}
