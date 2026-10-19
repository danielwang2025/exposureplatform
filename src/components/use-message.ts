"use client";

import { useTranslations } from "next-intl";

// Translate a dotted message key returned by a server action (e.g. "validation.email").
export function useMessage() {
  const t = useTranslations();
  return (key: string | undefined) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    key ? (t.has(key as any) ? t(key as any) : t("errors.generic")) : undefined;
}
