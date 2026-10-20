"use client";

import "./globals.css";

// Last-resort fallback when the root layout itself fails. It replaces the
// layout, so there's no translation provider: the text is bilingual.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : null;

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-4 font-sans text-foreground">
        <main className="max-w-md space-y-3 text-center">
          <p aria-hidden className="text-4xl">🌱</p>
          <h1 className="text-xl font-semibold">Something went wrong · 出了点问题</h1>
          <p className="text-sm text-muted">
            Sprout couldn&apos;t load this page. Please try again in a moment.
            <br />
            页面暂时无法加载，请稍后重试。
          </p>
          {digest && (
            <p className="text-xs text-muted">
              Error ID · 错误编号: <code className="select-all">{digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-medium text-white"
          >
            Try again · 重试
          </button>
        </main>
      </body>
    </html>
  );
}
