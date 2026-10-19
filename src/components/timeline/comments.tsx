"use client";

import { useRef, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { addComment, deleteComment } from "@/app/(app)/children/comment-actions";
import { Alert, Button } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { PostComment } from "@/lib/data/comments";

export function Comments({
  childId,
  postId,
  comments,
  userId,
  isOwner,
}: {
  childId: string;
  postId: string;
  comments: PostComment[];
  userId: string;
  isOwner: boolean;
}) {
  const t = useTranslations("comments");
  const format = useFormatter();
  const m = useMessage();
  const form = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <section id="comments" className="scroll-mt-20 space-y-4">
      <h2 className="font-semibold">{t("title")}</h2>

      {comments.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl bg-surface px-4 py-3 shadow-sm ring-1 ring-border">
              <div className="flex items-baseline gap-2 text-xs text-muted">
                <span className="font-medium text-foreground">{c.authorName || t("someone")}</span>
                <time dateTime={c.createdAt}>{format.relativeTime(new Date(c.createdAt))}</time>
                {(c.authorId === userId || isOwner) && (
                  <button
                    type="button"
                    className="ml-auto text-danger hover:underline"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm(t("deleteConfirm"))) return;
                      startTransition(async () => {
                        const result = await deleteComment(childId, c.id);
                        setError(result.ok ? undefined : result.error);
                      });
                    }}
                  >
                    {t("delete")}
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form
        ref={form}
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const body = String(new FormData(event.currentTarget).get("body") ?? "");
          startTransition(async () => {
            const result = await addComment(childId, postId, body);
            if (result.ok) {
              form.current?.reset();
              setError(undefined);
            } else {
              setError(result.error);
            }
          });
        }}
      >
        {error && <Alert>{m(error)}</Alert>}
        <label htmlFor="comment-body" className="sr-only">
          {t("placeholder")}
        </label>
        <textarea
          id="comment-body"
          name="body"
          rows={2}
          maxLength={2000}
          required
          placeholder={t("placeholder")}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted">{t("privacyNote")}</p>
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </section>
  );
}
