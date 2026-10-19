import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Comments } from "@/components/timeline/comments";
import { PostCard } from "@/components/timeline/post-card";
import { requireUser } from "@/lib/auth";
import { getChild } from "@/lib/data/children";
import { listComments } from "@/lib/data/comments";
import { getPost } from "@/lib/data/posts";

export async function generateMetadata({ params }: PageProps<"/children/[childId]/posts/[postId]">): Promise<Metadata> {
  const { childId, postId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  const post = child ? await getPost(child, postId, user.id) : null;
  return { title: post?.title || child?.nickname };
}

export default async function PostPage({ params }: PageProps<"/children/[childId]/posts/[postId]">) {
  const { childId, postId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();
  const post = await getPost(child, postId, user.id);
  if (!post) notFound();
  const [t, comments] = await Promise.all([getTranslations("tabs"), listComments(post.id)]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/children/${child.id}`} className="text-sm text-primary hover:underline">
        ← {child.nickname} · {t("timeline")}
      </Link>
      <PostCard variant="member" post={post} childId={child.id} birthDate={child.birth_date} isOwner={child.role === "owner"} />
      <Comments childId={child.id} postId={post.id} comments={comments} userId={user.id} isOwner={child.role === "owner"} />
    </div>
  );
}
