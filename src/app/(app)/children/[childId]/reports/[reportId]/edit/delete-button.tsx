"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteReport } from "@/app/(app)/children/report-actions";
import { Alert, Button } from "@/components/ui";
import { useMessage } from "@/components/use-message";

export function DeleteReportButton({ childId, reportId }: { childId: string; reportId: string }) {
  const t = useTranslations("reports");
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-2">
      {error && <Alert>{m(error)}</Alert>}
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("deleteConfirm"))) return;
          startTransition(async () => {
            const result = await deleteReport(childId, reportId);
            setError(result?.error);
          });
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}
