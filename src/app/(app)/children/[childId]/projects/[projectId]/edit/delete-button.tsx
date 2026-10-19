"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { deleteProject } from "@/app/(app)/children/project-actions";
import { Alert, Button } from "@/components/ui";
import { useMessage } from "@/components/use-message";

export function DeleteProjectButton({ childId, projectId }: { childId: string; projectId: string }) {
  const t = useTranslations("projects");
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
            const result = await deleteProject(childId, projectId);
            setError(result?.error);
          });
        }}
      >
        {t("delete")}
      </Button>
    </div>
  );
}
