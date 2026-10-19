"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deletePost } from "@/app/(app)/children/post-actions";
import { createShareLink } from "@/app/(app)/children/share-actions";
import { buttonClass } from "@/components/ui";
import { useMessage } from "@/components/use-message";

export function PostActionsMenu({
  childId,
  postId,
  canEdit,
  canShare,
}: {
  childId: string;
  postId: string;
  canEdit: boolean;
  canShare: boolean;
}) {
  const t = useTranslations("posts");
  const m = useMessage();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string }>();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        {canShare && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("ghost", "h-8 px-2 text-xs")}
            onClick={() =>
              startTransition(async () => {
                const result = await createShareLink(childId, { scope: "post", postId });
                if (!result.ok) {
                  setNotice({ tone: "error", text: m(result.error) ?? "" });
                  return;
                }
                await navigator.clipboard.writeText(`${window.location.origin}/s/${result.token}`).catch(() => {});
                setNotice({ tone: "ok", text: t("linkCopied") });
              })
            }
          >
            {t("share")}
          </button>
        )}
        {canEdit && (
          <>
            <Link href={`/children/${childId}/posts/${postId}/edit`} className={buttonClass("ghost", "h-8 px-2 text-xs")}>
              {t("edit")}
            </Link>
            <button
              type="button"
              disabled={pending}
              className={buttonClass("ghost", "h-8 px-2 text-xs text-danger")}
              onClick={() => {
                if (!window.confirm(t("deleteConfirm"))) return;
                startTransition(async () => {
                  const result = await deletePost(childId, postId);
                  if (!result.ok) window.alert(m(result.error));
                  router.refresh();
                });
              }}
            >
              {t("delete")}
            </button>
          </>
        )}
      </div>
      {notice && (
        <p role="status" className={notice.tone === "ok" ? "max-w-56 text-right text-xs text-primary" : "max-w-56 text-right text-xs text-danger"}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
