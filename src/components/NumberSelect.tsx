"use client";

/** スライダーの代わりに、数値を選ぶ（または近い刻みで選ぶ） */
export function NumberSelect({
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix = "",
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (n: number) => void;
  suffix?: string;
}) {
  const options: number[] = [];
  const steps = Math.round((max - min) / step);
  for (let i = 0; i <= steps; i++) {
    const n = Math.round((min + i * step) * 1000) / 1000;
    if (n <= max + 1e-9) options.push(n);
  }
  const safe = options.includes(value)
    ? value
    : options.reduce((best, n) => (Math.abs(n - value) < Math.abs(best - value) ? n : best), options[0] ?? value);

  return (
    <select value={String(safe)} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((n) => (
        <option key={n} value={n}>
          {step < 1 ? n.toFixed(1) : String(n)}
          {suffix}
        </option>
      ))}
    </select>
  );
}
