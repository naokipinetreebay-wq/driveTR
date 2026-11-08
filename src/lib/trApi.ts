/** 部屋作成時だけ叩く TRwebapp ブートストラップ API（Cloudflare） */

export const TR_API_BASE = "https://tr-api.rojiura.app";

const PROFILE_KEY = "pt-tr-profile";
const DEVICE_ID_KEY = "pt-tr-device-id";
const REGISTERED_AT_KEY = "pt-tr-registered-at";
const AD_LAST_KEY = "pt-tr-ad-last";
const AD_SKIP_KEY = "pt-tr-ad-skip";

export type TrProfile = {
  userAgeBand?: string;
  usageType?: string;
  groupSizeBand?: string;
  prefecture?: string;
  traineeAgeBand?: string;
};

/** 端末ローカルに永続保存する利用コンテキスト（期限なし） */
export type TrLocalIdentity = {
  deviceId: string;
  registeredAt: number;
  profile: TrProfile;
};

export type TrCreative = {
  id: string;
  kind: string;
  title: string;
  url: string;
  mediaUrl?: string;
  mediaType?: string;
  durationSeconds: number;
  skippable: boolean;
};

export type TrBootstrapResponse = {
  serverNow: number;
  profileAccepted: boolean;
  ad: {
    show: boolean;
    reason: string;
    count: number;
    creatives: TrCreative[];
  };
  package: { version: string; note?: string };
};

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 端末個別 ID（なければ発行して永続保存） */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = newId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return newId();
  }
}

export function getRegisteredAt(): number | null {
  try {
    const n = Number(localStorage.getItem(REGISTERED_AT_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function loadProfile(): TrProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TrProfile;
  } catch {
    return null;
  }
}

/**
 * 利用状況を端末に保存（localStorage・期限なし＝ブラウザデータを消さない限り永続）。
 * 初回保存時に登録日を刻む。
 */
export function saveProfile(profile: TrProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  getOrCreateDeviceId();
  if (!localStorage.getItem(REGISTERED_AT_KEY)) {
    localStorage.setItem(REGISTERED_AT_KEY, String(Date.now()));
  }
}

export function loadLocalIdentity(): TrLocalIdentity | null {
  if (!isProfilePromptDone()) return null;
  return {
    deviceId: getOrCreateDeviceId(),
    registeredAt: getRegisteredAt() ?? Date.now(),
    profile: loadProfile() ?? {},
  };
}

/** 利用状況の確認画面を一度でも出したか（スキップ含む） */
export function isProfilePromptDone(): boolean {
  try {
    return localStorage.getItem(PROFILE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadAdState() {
  const lastAdAt = Number(localStorage.getItem(AD_LAST_KEY));
  const skipDebt = Number(localStorage.getItem(AD_SKIP_KEY));
  return {
    lastAdAt: Number.isFinite(lastAdAt) && lastAdAt > 0 ? lastAdAt : null,
    skipDebt: Number.isFinite(skipDebt) && skipDebt > 0 ? Math.floor(skipDebt) : 0,
  };
}

export function markAdSeen() {
  localStorage.setItem(AD_LAST_KEY, String(Date.now()));
}

export function addSkipDebt(n = 1) {
  const { skipDebt } = loadAdState();
  localStorage.setItem(AD_SKIP_KEY, String(skipDebt + n));
}

export function repaySkipDebt(n: number) {
  const { skipDebt } = loadAdState();
  localStorage.setItem(AD_SKIP_KEY, String(Math.max(0, skipDebt - n)));
}

function identityPayload() {
  const identity = loadLocalIdentity();
  return {
    deviceId: identity?.deviceId ?? getOrCreateDeviceId(),
    registeredAt: identity?.registeredAt ?? getRegisteredAt(),
    profile: identity?.profile ?? loadProfile(),
  };
}

export async function bootstrapSession(client: {
  app: string;
  roomCode?: string;
  controllerId?: string;
}): Promise<TrBootstrapResponse> {
  const ad = loadAdState();
  const identity = identityPayload();
  const res = await fetch(`${TR_API_BASE}/v1/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...identity,
      client,
      lastAdAt: ad.lastAdAt,
      skipDebt: ad.skipDebt,
    }),
  });
  if (!res.ok) throw new Error("ブートストラップに失敗しました");
  return (await res.json()) as TrBootstrapResponse;
}

/** 広告視聴・スキップなどの統計イベント */
export async function postStatsEvent(input: {
  type: string;
  client: { app: string; roomCode?: string };
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    const identity = identityPayload();
    await fetch(`${TR_API_BASE}/v1/stats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: input.type,
        ...identity,
        client: input.client,
        payload: input.payload ?? {},
      }),
      keepalive: true,
    });
  } catch {
    /* 統計失敗でも本編は止めない */
  }
}
