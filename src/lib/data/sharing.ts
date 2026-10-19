import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { listAllowedPosts } from "./posts";

export type ShareScope = Database["public"]["Enums"]["share_scope"];

export type ShareLink = {
  id: string;
  scope: ShareScope;
  token: string;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  target: string | null; // project title or post title/body excerpt
};

// Owners only; RLS returns nothing for other roles.
export async function listShareLinks(childId: string): Promise<ShareLink[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("share_links")
    .select("id, scope, token, label, created_at, expires_at, view_count, last_viewed_at, projects ( title ), posts ( title, body )")
    .eq("child_id", childId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const now = new Date().toISOString();
  return data
    .filter((row) => !row.expires_at || row.expires_at > now)
    .map((row) => ({
      id: row.id,
      scope: row.scope,
      token: row.token,
      label: row.label,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      viewCount: row.view_count,
      lastViewedAt: row.last_viewed_at,
      target: row.projects?.title ?? (row.posts ? row.posts.title || row.posts.body.slice(0, 60) : null),
    }));
}

const PAGE_SIZE = 20;

export async function getSharedView(token: string, page: number) {
  const supabase = await createClient();
  const { data: resolved } = await supabase.rpc("resolve_share", { p_token: token });
  const share = resolved?.[0];
  if (!share) return null;

  const limit = PAGE_SIZE * page;
  const { data: allowed, error } = await supabase.rpc("shared_post_ids", {
    p_token: token,
    p_limit: limit + 1,
    p_offset: 0,
  });
  if (error) throw error;
  return { share, ...(await listAllowedPosts(allowed, { limit })) };
}

export async function getPublicView(slug: string, page: number) {
  const supabase = await createClient();
  const { data: children } = await supabase.rpc("public_child", { p_slug: slug });
  const child = children?.[0];
  if (!child) return null;

  const limit = PAGE_SIZE * page;
  const { data: allowed, error } = await supabase.rpc("public_post_ids", {
    p_slug: slug,
    p_limit: limit + 1,
    p_offset: 0,
  });
  if (error) throw error;
  return { child, ...(await listAllowedPosts(allowed, { limit })) };
}
