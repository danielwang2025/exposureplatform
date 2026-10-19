"use client";

import Link from "next/link";
import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setLiked } from "@/app/(app)/children/comment-actions";
import { cn } from "@/components/ui";

export function PostSocial({
  childId,
  postId,
  likeCount,
  likedByMe,
  commentCount,
}: {
  childId: string;
  postId: string;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}) {
  const t = useTranslations("comments");
  const [, startTransition] = useTransition();
  const [like, setOptimistic] = useOptimistic({ count: likeCount, mine: likedByMe });

  return (
    <div className="flex items-center gap-1 border-t border-border pt-2 text-sm">
      <button
        type="button"
        aria-pressed={like.mine}
        aria-label={like.mine ? t("unlike") : t("like")}
        onClick={() =>
          startTransition(async () => {
            const next = !like.mine;
            setOptimistic({ count: like.count + (next ? 1 : -1), mine: next });
            await setLiked(childId, postId, next);
          })
        }
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg px-2 transition-colors hover:bg-background",
          like.mine ? "text-rose-600" : "text-muted",
        )}
      >
        <span aria-hidden>{like.mine ? "❤️" : "🤍"}</span>
        {like.count > 0 && <span>{like.count}</span>}
      </button>
      <Link
        href={`/children/${childId}/posts/${postId}#comments`}
        className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-muted transition-colors hover:bg-background"
      >
        <span aria-hidden>💬</span>
        {commentCount > 0 ? t("count", { count: commentCount }) : t("add")}
      </Link>
    </div>
  );
}
