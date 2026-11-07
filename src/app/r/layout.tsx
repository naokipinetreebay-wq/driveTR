import { Suspense } from "react";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="error-page"><p>読み込み中…</p></main>}>{children}</Suspense>;
}
