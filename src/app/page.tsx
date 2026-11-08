"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AdGate } from "@/components/AdGate";
import { ProfileGate } from "@/components/ProfileGate";
import {
  bootstrapSession,
  isProfilePromptDone,
  type TrBootstrapResponse,
} from "@/lib/trApi";
import { createRoom } from "@/lib/ws";

const APP = "drive";

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<TrBootstrapResponse | null>(null);
  const [needProfile, setNeedProfile] = useState(false);
  const continueAfterProfile = useRef(false);

  const createAndEnter = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom();
      router.push(`/r/?code=${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      setBusy(false);
    }
  };

  const runBootstrapAndCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      let boot: TrBootstrapResponse | null = null;
      try {
        boot = await bootstrapSession({ app: APP });
      } catch {
        // オフラインでも部屋作成は通す
      }
      if (boot?.ad.show && boot.ad.creatives.length > 0) {
        setBootstrap(boot);
        setBusy(false);
        return;
      }
      await createAndEnter();
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      setBusy(false);
    }
  };

  const onStart = async () => {
    if (!isProfilePromptDone()) {
      continueAfterProfile.current = true;
      setNeedProfile(true);
      return;
    }
    await runBootstrapAndCreate();
  };

  if (needProfile) {
    return (
      <ProfileGate
        onDone={() => {
          setNeedProfile(false);
          if (continueAfterProfile.current) {
            continueAfterProfile.current = false;
            void runBootstrapAndCreate();
          }
        }}
      />
    );
  }

  if (bootstrap) {
    return (
      <AdGate
        bootstrap={bootstrap}
        busy={busy}
        error={error}
        onDone={() => {
          if (busy) return;
          void createAndEnter();
        }}
      />
    );
  }

  return (
    <main className="home">
      <div className="home-card">
        <p className="eyebrow">Drive · TRwebapp</p>
        <h1>ドライブ</h1>
        <p>
          手前の列から奥へ、緑のすき間をめがけてボールを運びます。各列の緑は1つで、となりの位置へだけ進みます。
        </p>
        <div className="home-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void onStart()}>
            {busy ? "準備中…" : "ルームを作成"}
          </button>
          <a className="btn" href="https://tr.rojiura.app">
            ポータル（tr）に戻る
          </a>
        </div>
        {error ? (
          <p className="muted" style={{ marginTop: 12, color: "var(--bad)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
