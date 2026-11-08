"use client";

import { useMemo, useState } from "react";
import { saveProfile, type TrProfile } from "@/lib/trApi";

const AGE_BANDS = [
  { value: "10s", label: "10代" },
  { value: "20s", label: "20代" },
  { value: "30s", label: "30代" },
  { value: "40s", label: "40代" },
  { value: "50s", label: "50代" },
  { value: "60plus", label: "60代以上" },
];

const USAGE_TYPES = [
  { value: "solo", label: "個人練習" },
  { value: "team", label: "チーム練習" },
  { value: "school", label: "スクール・教室" },
  { value: "other", label: "その他" },
];

const GROUP_SIZES = [
  { value: "1", label: "1人" },
  { value: "2-5", label: "2〜5人" },
  { value: "6-10", label: "6〜10人" },
  { value: "11plus", label: "11人以上" },
];

const TRAINEE_AGES = [
  { value: "elementary", label: "小学生" },
  { value: "junior", label: "中学生" },
  { value: "high", label: "高校生" },
  { value: "adult", label: "大学生・一般" },
  { value: "mixed", label: "混合" },
];

const PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
];

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "選択してください",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ProfileGate({ onDone }: { onDone: () => void }) {
  const [userAgeBand, setUserAgeBand] = useState("");
  const [usageType, setUsageType] = useState("");
  const [groupSizeBand, setGroupSizeBand] = useState("");
  const [prefecture, setPrefecture] = useState("");
  const [traineeAgeBand, setTraineeAgeBand] = useState("");

  const prefectureOptions = useMemo(
    () => PREFECTURES.map((p) => ({ value: p, label: p })),
    []
  );

  const finish = (profile: TrProfile) => {
    saveProfile(profile);
    onDone();
  };

  const onSave = () => {
    const profile: TrProfile = {};
    if (userAgeBand) profile.userAgeBand = userAgeBand;
    if (usageType) profile.usageType = usageType;
    if (groupSizeBand) profile.groupSizeBand = groupSizeBand;
    if (prefecture) profile.prefecture = prefecture;
    if (traineeAgeBand) profile.traineeAgeBand = traineeAgeBand;
    finish(profile);
  };

  return (
    <main className="home">
      <div className="home-card">
        <p className="eyebrow">利用状況</p>
        <h1>かんたんに教えてください</h1>
        <p className="muted">
          広告の内容を合わせる参考にします。この端末にだけ保存し、サーバー側で個人情報として集めたり残したりはしません。スキップしても利用できます。
        </p>

        <div className="profile-fields">
          <SelectField
            label="あなたの年代"
            value={userAgeBand}
            onChange={setUserAgeBand}
            options={AGE_BANDS}
          />
          <SelectField
            label="使い方"
            value={usageType}
            onChange={setUsageType}
            options={USAGE_TYPES}
          />
          <SelectField
            label="だいたいの人数"
            value={groupSizeBand}
            onChange={setGroupSizeBand}
            options={GROUP_SIZES}
          />
          <SelectField
            label="主な練習地域"
            value={prefecture}
            onChange={setPrefecture}
            options={prefectureOptions}
          />
          <SelectField
            label="練習している人の年代"
            value={traineeAgeBand}
            onChange={setTraineeAgeBand}
            options={TRAINEE_AGES}
          />
        </div>

        <div className="home-actions">
          <button type="button" className="btn primary" onClick={onSave}>
            保存して続ける
          </button>
          <button type="button" className="btn" onClick={() => finish({})}>
            スキップ
          </button>
        </div>
      </div>
    </main>
  );
}
