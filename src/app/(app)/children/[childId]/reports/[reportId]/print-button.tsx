"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";

// The browser's print dialog has "Save as PDF" on every platform.
export function PrintButton() {
  const t = useTranslations("reports");
  return (
    <Button type="button" onClick={() => window.print()}>
      ⬇ {t("downloadPdf")}
    </Button>
  );
}
