"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonClass } from "@/components/ui";

// Fallback for an unexpected error while rendering a page. The error ID is
// the digest logged by src/instrumentation.ts, so it can be looked up.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("errorPage");
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : null;

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <span aria-hidden className="text-4xl">🌧️</span>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted">{t("body")}</p>
      {digest && (
        <p className="text-xs text-muted">
          {t("errorId")}: <code className="select-all">{digest}</code>
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
          {t("retry")}
        </button>
        <Link href="/" className={buttonClass("secondary")}>
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
