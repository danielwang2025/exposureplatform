import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signPlayback, type PlaybackTokens } from "@/lib/mux";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import { atLeast, isUuid, type ChildWithRole } from "./children";

export type PostKind = Database["public"]["Enums"]["post_kind"];
export type MediaStatus = Database["public"]["Enums"]["media_status"];

export const postKinds = ["moment", "milestone", "review"] as const satisfies readonly PostKind[];

export type TimelineMedia = {
  id: string;
  kind: "image" | "video";
  status: MediaStatus;
  width: number | null;
  height: number | null;
  thumbUrl?: string;
  fullUrl?: string;
  playbackId?: string;
  tokens?: PlaybackTokens;
  error: string | null;
};

export type TimelinePost = {
  id: string;
  kind: PostKind;
  title: string | null;
  body: string;
  occurredOn: string;
  visibility: Database["public"]["Enums"]["visibility"];
  authorId: string | null;
  authorName: string;
  createdAt: string;
  // id is omitted on shared/public pages, where projects aren't browsable.
  project: { id?: string; title: string; emoji: string | null } | null;
  media: TimelineMedia[];
  canEdit: boolean;
  // Members only; shared and public pages never load reactions.
  social?: { likeCount: number; likedByMe: boolean; commentCount: number };
  // Members only, like reactions: skill ratings on a review, in skill order.
  ratings?: PostRating[];
};

export type PostRating = { skillId: string; name: string; emoji: string | null; score: number; archived: boolean };

const SIGNED_URL_SECONDS = 60 * 60;

const postSelect = `
  id, kind, title, body, occurred_on, visibility, author_id, created_at, project_id,
  profiles ( display_name ),
  projects ( id, title, emoji ),
  media ( id, kind, status, position, width, height, storage_path, thumb_path, mux_playback_id, error )
` as const;

const memberPostSelect = `${postSelect}, comments ( count ), post_likes ( user_id ),
  skill_ratings ( skill_id, score, skills ( name, emoji, position, created_at, archived_at ) )` as const;

export function canEditPost(child: ChildWithRole, authorId: string | null, userId: string) {
  if (child.role === "owner") return true;
  if (authorId !== userId) return false;
  // Teachers only ever author reviews (enforced by RLS).
  return atLeast(child.role, "editor") || child.role === "teacher";
}

type TimelineFilter = { limit: number; kind?: PostKind; projectId?: string; oldestFirst?: boolean };

export async function listTimeline(
  child: ChildWithRole,
  userId: string,
  { limit, kind, projectId, oldestFirst = false }: TimelineFilter,
): Promise<{ posts: TimelinePost[]; hasMore: boolean }> {
  const supabase = await createClient();
  let query = supabase.from("posts").select(memberPostSelect).eq("child_id", child.id);
  if (kind) query = query.eq("kind", kind);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query
    .order("occurred_on", { ascending: oldestFirst })
    .order("created_at", { ascending: oldestFirst })
    .order("position", { referencedTable: "media", ascending: true })
    .limit(limit + 1);
  if (error) throw error;

  const posts = await toTimelinePosts(data.slice(0, limit), {
    signer: supabase,
    canEdit: (authorId) => canEditPost(child, authorId, userId),
    userId,
  });
  return { posts, hasMore: data.length > limit };
}

export async function getPost(child: ChildWithRole, postId: string, userId: string): Promise<TimelinePost | null> {
  if (!isUuid(postId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(memberPostSelect)
    .eq("id", postId)
    .eq("child_id", child.id)
    .order("position", { referencedTable: "media", ascending: true })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [post] = await toTimelinePosts([data], {
    signer: supabase,
    canEdit: (authorId) => canEditPost(child, authorId, userId),
    userId,
  });
  return post;
}

type AllowedPost = { post_id: string; project_title: string | null; project_emoji: string | null };

// Posts for a share link or public page. The database function decides which
// posts are allowed; only those are then loaded (with the admin client, since
// the visitor has no session) and only their ready media is signed.
export async function listAllowedPosts(
  allowed: AllowedPost[],
  { limit }: { limit: number },
): Promise<{ posts: TimelinePost[]; hasMore: boolean }> {
  const page = allowed.slice(0, limit);
  if (page.length === 0) return { posts: [], hasMore: false };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("posts")
    .select(postSelect)
    .in("id", page.map((p) => p.post_id))
    .order("position", { referencedTable: "media", ascending: true });
  if (error) throw error;

  const byId = new Map(data.map((row) => [row.id, row]));
  const rows = page.flatMap((p) => {
    const row = byId.get(p.post_id);
    if (!row) return [];
    return [{
      ...row,
      profiles: null,
      projects: p.project_title ? { title: p.project_title, emoji: p.project_emoji } : null,
      media: row.media.filter((m) => m.status === "ready"),
    }];
  });

  const posts = await toTimelinePosts(rows, { signer: admin, canEdit: () => false });
  return { posts, hasMore: allowed.length > limit };
}

type PostRow = {
  id: string;
  kind: PostKind;
  title: string | null;
  body: string;
  occurred_on: string;
  visibility: Database["public"]["Enums"]["visibility"];
  author_id: string | null;
  created_at: string;
  profiles: { display_name: string } | null;
  projects: { id?: string; title: string; emoji: string | null } | null;
  media: Array<{
    id: string;
    kind: "image" | "video";
    status: MediaStatus;
    position: number;
    width: number | null;
    height: number | null;
    storage_path: string | null;
    thumb_path: string | null;
    mux_playback_id: string | null;
    error: string | null;
  }>;
  comments?: { count: number }[];
  post_likes?: { user_id: string }[];
  skill_ratings?: Array<{
    skill_id: string;
    score: number;
    skills: { name: string; emoji: string | null; position: number; created_at: string; archived_at: string | null } | null;
  }>;
};

async function toTimelinePosts(
  rows: PostRow[],
  {
    signer,
    canEdit,
    userId,
  }: { signer: SupabaseClient<Database>; canEdit: (authorId: string | null) => boolean; userId?: string },
): Promise<TimelinePost[]> {
  const allMedia = rows.flatMap((p) => p.media);
  const readyImages = allMedia.filter((m) => m.kind === "image" && m.status === "ready");
  const readyVideos = allMedia.filter((m) => m.kind === "video" && m.status === "ready" && m.mux_playback_id);

  // For members this is the user's client, so the storage policy re-checks access.
  const paths = readyImages.flatMap((m) => [m.thumb_path!, m.storage_path!]);
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await signer.storage.from("media").createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
    }
  }

  const tokens = new Map<string, PlaybackTokens>();
  await Promise.all(
    readyVideos.map(async (m) => {
      try {
        tokens.set(m.id, await signPlayback(m.mux_playback_id!));
      } catch (error) {
        console.error("failed to sign Mux playback", error);
      }
    }),
  );

  return rows.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    body: p.body,
    occurredOn: p.occurred_on,
    visibility: p.visibility,
    authorId: p.author_id,
    authorName: p.profiles?.display_name ?? "",
    createdAt: p.created_at,
    project: p.projects,
    canEdit: canEdit(p.author_id),
    social:
      userId && p.post_likes && p.comments
        ? {
            likeCount: p.post_likes.length,
            likedByMe: p.post_likes.some((l) => l.user_id === userId),
            commentCount: p.comments[0]?.count ?? 0,
          }
        : undefined,
    ratings: p.skill_ratings ? toRatings(p.skill_ratings) : undefined,
    media: p.media.map((m) => ({
      id: m.id,
      kind: m.kind,
      status: m.status,
      width: m.width,
      height: m.height,
      error: m.error,
      thumbUrl: m.thumb_path ? signed.get(m.thumb_path) : undefined,
      fullUrl: m.storage_path ? signed.get(m.storage_path) : undefined,
      playbackId: m.mux_playback_id ?? undefined,
      tokens: tokens.get(m.id),
    })),
  }));
}

function toRatings(rows: NonNullable<PostRow["skill_ratings"]>): PostRating[] {
  return rows
    .flatMap((r) => (r.skills ? [{ ...r, skill: r.skills }] : []))
    .sort((a, b) => a.skill.position - b.skill.position || a.skill.created_at.localeCompare(b.skill.created_at))
    .map((r) => ({
      skillId: r.skill_id,
      name: r.skill.name,
      emoji: r.skill.emoji,
      score: r.score,
      archived: Boolean(r.skill.archived_at),
    }));
}
