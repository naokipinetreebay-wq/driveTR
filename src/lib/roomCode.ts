"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export function useRoomCode(): string {
  const params = useParams<{ code: string }>();
  const [code, setCode] = useState(() => {
    const raw = String(params.code || "");
    return raw && raw !== "_" ? raw.toUpperCase() : "";
  });

  useEffect(() => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const marker = parts.findIndex((p) => p === "r" || p === "d");
    const fromPath = marker >= 0 ? parts[marker + 1] || "" : "";
    if (fromPath && fromPath !== "_") {
      setCode(fromPath.toUpperCase());
      return;
    }
    const raw = String(params.code || "");
    if (raw && raw !== "_") setCode(raw.toUpperCase());
  }, [params.code]);

  return code;
}
