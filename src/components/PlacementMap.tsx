"use client";

import { slotsFor } from "@/lib/placement";

export function PlacementMap({ counts }: { counts: number[] }) {
  const slots = slotsFor(counts);
  const rows = [...counts].map((count, index) => ({ row: index + 1, count })).reverse();

  return (
    <div className="drive-map">
      <p className="drive-axis">奥</p>
      {rows.map((row) => (
        <div key={row.row} className="drive-row" aria-hidden="true">
          {slots
            .filter((slot) => slot.row === row.row)
            .map((slot) => (
              <span key={slot.no} className={`placement-dot drive-dot filled ${slot.controller ? "self" : ""}`}>
                {slot.controller ? "操" : slot.no}
              </span>
            ))}
        </div>
      ))}
      <p className="drive-axis">手前 · プレイヤーから見て左が操</p>
    </div>
  );
}
