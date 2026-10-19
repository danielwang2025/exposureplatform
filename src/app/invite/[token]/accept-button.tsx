"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { acceptInvitation } from "@/app/(app)/children/actions";
import { Alert, Button } from "@/components/ui";
import { useMessage } from "@/components/use-message";

export function AcceptInvitationButton({ token }: { token: string }) {
  const t = useTranslations("invite");
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="space-y-3">
      {error && <Alert>{m(error)}</Alert>}
      <Button
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token);
            setError(result?.error);
          })
        }
      >
        {t("accept")}
      </Button>
    </div>
  );
}
