/** 部屋作成時だけ叩く TRwebapp ブートストラップ API（Cloudflare） */

export const TR_API_BASE = "https://tr-api.rojiura.app";

const PROFILE_KEY = "pt-tr-profile";
/** この端末から一度でも bootstrap したか（未保存＝初回端末リクエストの判定用。識別子ではない） */
const SEEN_KEY = "pt-tr-seen";
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

/**
 * 利用状況を端末に保存（localStorage・期限なし）。
 * サーバーへ送る識別子は発行しない。
 */
export function saveProfile(profile: TrProfile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  if (!localStorage.getItem(REGISTERED_AT_KEY)) {
    localStorage.setItem(REGISTERED_AT_KEY, String(Date.now()));
  }
}

/** 利用状況の確認画面を一度でも出したか（スキップ含む） */
export function isProfilePromptDone(): boolean {
  try {
    return localStorage.getItem(PROFILE_KEY) !== null;
  } catch {
    return false;
  }
}

/** 端末に統計用の保存がまだない（＝初回リクエスト候補） */
export function isFirstVisitTerminal(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) == null;
  } catch {
    return true;
  }
}

function markTerminalSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* ignore */
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
  const ad = loadAdState();
  const firstVisit = isFirstVisitTerminal();
  const res = await fetch(`${TR_API_BASE}/v1/bootstrap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profile: loadProfile(),
      firstVisit,
      client,
      lastAdAt: ad.lastAdAt,
      skipDebt: ad.skipDebt,
    }),
  });
  if (!res.ok) throw new Error("ブートストラップに失敗しました");
  markTerminalSeen();
  return (await res.json()) as TrBootstrapResponse;
}

/** 広告視聴・スキップなどの統計イベント（識別子は送らない） */
export async function postStatsEvent(input: {
  type: string;
  client: { app: string; roomCode?: string };
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch(`${TR_API_BASE}/v1/stats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: input.type,
        profile: loadProfile(),
        client: input.client,
        payload: input.payload ?? {},
      }),
      keepalive: true,
    });
  } catch {
    /* 統計失敗でも本編は止めない */
  }
}
