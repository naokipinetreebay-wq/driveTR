"use client";

import { useEffect, useRef, useState } from "react";
import { ColorScreen } from "@/components/ColorScreen";
import { ControllerPanel } from "@/components/ControllerPanel";
import { SetupWizard } from "@/components/SetupWizard";
import { slotCaption } from "@/lib/placement";
import { useDrivePlayView } from "@/lib/playView";
import { neededPhones } from "@/lib/types";
import { useRoomCode } from "@/lib/roomCode";
import { useDeviceId, useRoomSocket } from "@/lib/ws";

export default function ControllerPage() {
  const code = useRoomCode();
  const deviceId = useDeviceId(`controller-${code}`);
  const { snapshot, error, connected, send } = useRoomSocket(code, "controller", deviceId);
  const playView = useDrivePlayView(snapshot, "controller");

  const wizardKey = `dv-wizard-done-${code}`;
  const [ready, setReady] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<"control" | "play">("control");
  const pendingStart = useRef(false);

  useEffect(() => {
    setReady(sessionStorage.getItem(wizardKey) === "1");
    setHydrated(true);
  }, [wizardKey]);

  useEffect(() => {
    if (!pendingStart.current || !ready || !snapshot) return;
    const needed = neededPhones(snapshot.config);
    const online = snapshot.displays.filter((d) => d.connected).length;
    if (!connected || online !== needed - 1 || snapshot.displays.length !== needed - 1) return;
    pendingStart.current = false;
    send({ type: "start" });
    setView("play");
  }, [connected, ready, send, snapshot]);

  if (error && !snapshot) {
    return (
      <main className="error-page">
        <div>
          <h1>接続できません</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  }

  if (!snapshot || !hydrated) {
    return (
      <main className="error-page">
        <p>ルームに接続中…</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <SetupWizard
        snapshot={snapshot}
        connected={connected}
        send={send}
        onDone={() => {
          sessionStorage.setItem(wizardKey, "1");
          pendingStart.current = true;
          setReady(true);
          setView("play");
        }}
      />
    );
  }

  if (view === "play" && (snapshot.config.running || playView.running)) {
    return (
      <ColorScreen
        signal={playView.signal}
        title="この端末"
        detail={slotCaption({ no: 1, row: 1, index: 0, controller: true })}
        sound={false}
        frameStartedAt={playView.frameStartedAt}
        running={playView.running || snapshot.config.running}
        onStop={() => {
          send({ type: "stop" });
          setView("control");
        }}
      />
    );
  }

  return (
    <>
      <ControllerPanel
        snapshot={snapshot}
        connected={connected}
        send={send}
        clearSessionKeys={[wizardKey]}
        onStart={() => setView("play")}
      />
      <div className="controller" style={{ paddingTop: 0 }}>
        <button
          type="button"
          className="btn linkish"
          onClick={() => {
            sessionStorage.removeItem(wizardKey);
            setReady(false);
            setView("control");
          }}
        >
          セットアップウィザードをやり直す
        </button>
      </div>
    </>
  );
}
