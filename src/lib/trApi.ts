/** 部屋作成時だけ叩く TRwebapp ブートストラップ API（Cloudflare） */

export const TR_API_BASE = "https://tr-api.rojiura.app";

const PROFILE_KEY = "pt-tr-profile";
const AD_LAST_KEY = "pt-tr-ad-last";
const AD_SKIP_KEY = "pt-tr-ad-skip";

export type TrProfile = {
  userAgeBand?: string;
  usageType?: string;
  groupSizeBand?: string;
  prefecture?: string;
  traineeAgeBand?: string;
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

export function loadProfile(): TrProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TrProfile;
  } catch {
    return null;
  }
}

export function saveProfile(profile: TrProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
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

export async function bootstrapSession(client: {
  app: string;
  roomCode?: string;
  controllerId?: string;
}): Promise<TrBootstrapResponse> {
  const profile = loadProfile();
  const ad = loadAdState();
  const res = await fetch(`${TR_API_BASE}/v1/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profile,
      client,
      lastAdAt: ad.lastAdAt,
      skipDebt: ad.skipDebt,
    }),
  });
  if (!res.ok) throw new Error("ブートストラップに失敗しました");
  return (await res.json()) as TrBootstrapResponse;
}
