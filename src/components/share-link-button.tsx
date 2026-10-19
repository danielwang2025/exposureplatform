"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createShareLink, type CreateLinkInput } from "@/app/(app)/children/share-actions";
import { Button } from "./ui";
import { useMessage } from "./use-message";

// Creates a new share link and copies it to the clipboard.
export function ShareLinkButton({ childId, input }: { childId: string; input: CreateLinkInput }) {
  const t = useTranslations("sharing");
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ ok: boolean; text: string; url?: string }>();

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createShareLink(childId, input);
            if (!result.ok) {
              setNotice({ ok: false, text: m(result.error) ?? "" });
              return;
            }
            const url = `${window.location.origin}/s/${result.token}`;
            const copied = await navigator.clipboard.writeText(url).then(() => true, () => false);
            setNotice({ ok: true, text: copied ? t("copiedNew") : t("created"), url: copied ? undefined : url });
          })
        }
      >
        🔗 {t("createLink")}
      </Button>
      {notice && (
        <p role="status" className={notice.ok ? "text-xs text-primary" : "text-xs text-danger"}>
          {notice.text}
          {notice.url && <span className="block break-all font-mono text-foreground">{notice.url}</span>}
        </p>
      )}
    </div>
  );
}
