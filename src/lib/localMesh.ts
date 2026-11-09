/**
 * ローカル化の本体: コントローラを親にした WebRTC DataChannel 星型。
 * WS は部屋参加・設定・シグナリング専用。プレー中の hostPush / clientEvent は DC 優先。
 */

export type SignalPayload =
  | { kind: "offer"; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; candidate: RTCIceCandidateInit | null };

export type SignalEnvelope = {
  type: "signal";
  from: string;
  to: string;
  payload: SignalPayload;
};

type GameHandler = (msg: unknown) => void;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

function isOpen(dc: RTCDataChannel | null | undefined) {
  return !!dc && dc.readyState === "open";
}

export class LocalMesh {
  readonly role: "controller" | "display";
  readonly deviceId: string;
  private sendSignal: (env: SignalEnvelope) => void;
  private onGame: GameHandler;
  private peers = new Map<
    string,
    { pc: RTCPeerConnection; dc: RTCDataChannel | null }
  >();
  private makingOffer = new Set<string>();
  destroyed = false;

  constructor(opts: {
    role: "controller" | "display";
    deviceId: string;
    sendSignal: (env: SignalEnvelope) => void;
    onGameMessage: GameHandler;
  }) {
    this.role = opts.role;
    this.deviceId = opts.deviceId;
    this.sendSignal = opts.sendSignal;
    this.onGame = opts.onGameMessage;
  }

  /** コントローラ: 参加端末が揃ったら／増えたら呼ぶ */
  async ensurePeer(remoteId: string) {
    if (this.destroyed || this.role !== "controller") return;
    if (!remoteId || remoteId === this.deviceId) return;
    if (this.peers.has(remoteId) || this.makingOffer.has(remoteId)) return;
    this.makingOffer.add(remoteId);
    try {
      const pc = this.createPc(remoteId);
      const dc = pc.createDataChannel("game", { ordered: true });
      this.attachDc(remoteId, dc);
      this.peers.set(remoteId, { pc, dc });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.sendSignal({
        type: "signal",
        from: this.deviceId,
        to: remoteId,
        payload: { kind: "offer", sdp: pc.localDescription!.toJSON() },
      });
    } catch {
      this.peers.delete(remoteId);
    } finally {
      this.makingOffer.delete(remoteId);
    }
  }

  async handleSignal(env: SignalEnvelope) {
    if (this.destroyed) return;
    if (env.to !== this.deviceId) return;
    const remoteId = env.from;
    const { payload } = env;

    if (payload.kind === "offer" && this.role === "display") {
      let entry = this.peers.get(remoteId);
      if (entry) {
        try {
          entry.pc.close();
        } catch {
          /* ignore */
        }
      }
      const pc = this.createPc(remoteId);
      this.peers.set(remoteId, { pc, dc: null });
      pc.ondatachannel = (ev) => this.attachDc(remoteId, ev.channel);
      await pc.setRemoteDescription(payload.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.sendSignal({
        type: "signal",
        from: this.deviceId,
        to: remoteId,
        payload: { kind: "answer", sdp: pc.localDescription!.toJSON() },
      });
      return;
    }

    if (payload.kind === "answer" && this.role === "controller") {
      const entry = this.peers.get(remoteId);
      if (!entry) return;
      await entry.pc.setRemoteDescription(payload.sdp);
      return;
    }

    if (payload.kind === "ice") {
      const entry = this.peers.get(remoteId);
      if (!entry) return;
      try {
        if (payload.candidate) await entry.pc.addIceCandidate(payload.candidate);
        else await entry.pc.addIceCandidate(null);
      } catch {
        /* ignore */
      }
    }
  }

  /** プレー用メッセージ。全 DC へ。1本も無ければ false */
  broadcastGame(msg: unknown): boolean {
    let any = false;
    const raw = JSON.stringify(msg);
    for (const { dc } of this.peers.values()) {
      if (!dc || !isOpen(dc)) continue;
      try {
        dc.send(raw);
        any = true;
      } catch {
        /* ignore */
      }
    }
    return any;
  }

  /** 参加端末→コントローラ（通常1本） */
  sendGameToController(msg: unknown): boolean {
    if (this.role !== "display") return false;
    for (const { dc } of this.peers.values()) {
      if (!dc || !isOpen(dc)) continue;
      try {
        dc.send(JSON.stringify(msg));
        return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  openPeerCount() {
    let n = 0;
    for (const { dc } of this.peers.values()) if (isOpen(dc)) n += 1;
    return n;
  }

  destroy() {
    this.destroyed = true;
    for (const { pc, dc } of this.peers.values()) {
      try {
        dc?.close();
      } catch {
        /* ignore */
      }
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
    this.peers.clear();
  }

  private createPc(remoteId: string) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (ev) => {
      this.sendSignal({
        type: "signal",
        from: this.deviceId,
        to: remoteId,
        payload: {
          kind: "ice",
          candidate: ev.candidate ? ev.candidate.toJSON() : null,
        },
      });
    };
    pc.onconnectionstatechange = () => {
      if (
        pc.connectionState === "failed" ||
        pc.connectionState === "closed" ||
        pc.connectionState === "disconnected"
      ) {
        // 次の ensurePeer / 再参加で作り直す
      }
    };
    return pc;
  }

  private attachDc(remoteId: string, dc: RTCDataChannel) {
    const entry = this.peers.get(remoteId);
    if (entry) entry.dc = dc;
    else this.peers.set(remoteId, { pc: this.createPc(remoteId), dc });

    dc.onmessage = (ev) => {
      try {
        this.onGame(JSON.parse(String(ev.data)));
      } catch {
        /* ignore */
      }
    };
  }
}
