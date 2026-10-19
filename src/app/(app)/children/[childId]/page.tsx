import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Timeline } from "@/components/timeline/timeline";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { listTimeline } from "@/lib/data/posts";
import { ChildHeader } from "./child-header";

const PAGE_SIZE = 20;

export async function generateMetadata({ params }: PageProps<"/children/[childId]">): Promise<Metadata> {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  return { title: child?.nickname };
}

export default async function ChildPage({ params, searchParams }: PageProps<"/children/[childId]">) {
  const { childId } = await params;
  const { page } = await searchParams;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();

  const pageNumber = Math.max(1, Math.min(50, Number(page) || 1));
  const [tp, { posts, hasMore }] = await Promise.all([
    getTranslations("posts"),
    listTimeline(child, user.id, { limit: PAGE_SIZE * pageNumber }),
  ]);
  const canPost = atLeast(child.role, "editor");
  const isTeacher = child.role === "teacher";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ChildHeader child={child} active="timeline" />

      {posts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span aria-hidden className="text-4xl">📷</span>
          <p className="font-medium">{tp("emptyTitle", { nickname: child.nickname })}</p>
          <p className="text-sm text-muted">
            {canPost ? tp("emptyHint") : isTeacher ? tp("emptyHintTeacher", { nickname: child.nickname }) : tp("emptyHintViewer")}
          </p>
          {(canPost || isTeacher) && (
            <Link
              href={`/children/${child.id}/posts/new${isTeacher ? "?kind=review" : ""}`}
              className={buttonClass("primary", "mt-2")}
            >
              + {isTeacher ? tp("newReview") : tp("first")}
            </Link>
          )}
        </Card>
      ) : (
        <>
          <Timeline
            posts={posts}
            card={{ variant: "member", childId: child.id, birthDate: child.birth_date, isOwner: child.role === "owner" }}
          />
          {hasMore && (
            <div className="text-center">
              <Link href={`/children/${child.id}?page=${pageNumber + 1}`} scroll={false} className={buttonClass("secondary")}>
                {tp("loadMore")}
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
