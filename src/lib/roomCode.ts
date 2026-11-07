"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

function readCodeFromLocation(paramsCode: string | undefined): string {
  if (typeof window !== "undefined") {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const marker = parts.findIndex((p) => p === "r" || p === "d");
    const fromPath = marker >= 0 ? parts[marker + 1] || "" : "";
    if (fromPath && fromPath !== "_") return fromPath.toUpperCase();
    const fromQuery = new URLSearchParams(window.location.search).get("code") || "";
    if (fromQuery) return fromQuery.toUpperCase();
  }
  const raw = String(paramsCode || "");
  return raw && raw !== "_" ? raw.toUpperCase() : "";
}

/** Pages の basePath（/fieldscan など）付き Display URL */
export function displayJoinUrl(code: string): string {
  if (typeof window === "undefined" || !code) return "";
  const appPath = window.location.pathname.replace(new RegExp("/(r|d)(/.*)?$"), "");
  return `${window.location.origin}${appPath}/d/?code=${encodeURIComponent(code)}`;
}

export function useRoomCode(): string {
  const params = useParams<{ code: string }>();
  const [code, setCode] = useState(() => readCodeFromLocation(params.code));

  useEffect(() => {
    setCode(readCodeFromLocation(params.code));
  }, [params.code]);

  return code;
}
