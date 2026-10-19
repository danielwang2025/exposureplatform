import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PostComment = {
  id: string;
  body: string;
  createdAt: string;
  edited: boolean;
  authorId: string;
  authorName: string;
};

// RLS returns comments only for posts the user can read.
export async function listComments(postId: string): Promise<PostComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, body, created_at, updated_at, author_id, profiles ( display_name )")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.created_at,
    edited: c.updated_at !== c.created_at,
    authorId: c.author_id,
    authorName: c.profiles?.display_name ?? "",
  }));
}
