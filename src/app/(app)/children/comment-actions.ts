"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { isUuid } from "@/lib/data/children";
import { allowAttempt } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const commentBody = z.string().trim().min(1, "comments.errors.empty").max(2000, "comments.errors.tooLong");

export async function addComment(childId: string, postId: string, body: string): Promise<Result> {
  const user = await requireUser();
  if (!isUuid(childId) || !isUuid(postId)) return { ok: false, error: "errors.forbidden" };
  const parsed = commentBody.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!(await allowAttempt("comment", user.id))) return { ok: false, error: "errors.rateLimited" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("comments")
    .insert({ post_id: postId, child_id: childId, author_id: user.id, body: parsed.data });
  if (error) return { ok: false, error: error.code === "42501" ? "errors.forbidden" : "errors.generic" };

  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}

export async function deleteComment(childId: string, commentId: string): Promise<Result> {
  await requireUser();
  if (!isUuid(childId) || !isUuid(commentId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId)
    .eq("child_id", childId)
    .select("id");
  if (error || data.length === 0) return { ok: false, error: "errors.forbidden" };

  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}

export async function setLiked(childId: string, postId: string, liked: boolean): Promise<Result> {
  const user = await requireUser();
  if (!isUuid(childId) || !isUuid(postId)) return { ok: false, error: "errors.forbidden" };

  const supabase = await createClient();
  const { error } = liked
    ? await supabase
        .from("post_likes")
        .upsert({ post_id: postId, child_id: childId, user_id: user.id }, { ignoreDuplicates: true })
    : await supabase.from("post_likes").delete().eq("post_id", postId).eq("user_id", user.id);
  if (error) return { ok: false, error: error.code === "42501" ? "errors.forbidden" : "errors.generic" };

  revalidatePath(`/children/${childId}`, "layout");
  return { ok: true };
}
