import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProgressChart } from "@/components/skills/progress-chart";
import { PostCard } from "@/components/timeline/post-card";
import { SharedHeader } from "@/components/timeline/shared-header";
import { Timeline } from "@/components/timeline/timeline";
import { buttonClass, Card } from "@/components/ui";
import { getSharedView } from "@/lib/data/sharing";
import { computeProgress } from "@/lib/progress";

// Don't resolve the token here: resolving counts as a view.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shared");
  return { title: t("title") };
}

export default async function SharedPage({ params, searchParams }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const { page } = await searchParams;
  if (!/^[0-9a-f]{48}$/.test(token)) notFound();

  const pageNumber = Math.max(1, Math.min(50, Number(page) || 1));
  const view = await getSharedView(token, pageNumber);
  if (!view) notFound();
  const { share, posts, hasMore } = view;
  const progress = share.scope === "project" ? computeProgress(posts) : null;
  const t = await getTranslations("shared");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <SharedHeader
        seed={token}
        nickname={share.child_nickname}
        ageYears={share.child_age_years}
        banner={t("banner", { nickname: share.child_nickname })}
      />

      {share.scope === "project" && share.project_title && (
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-2xl">
            {share.project_emoji ?? "📁"}
          </span>
          <div>
            <h2 className="text-xl font-semibold">{share.project_title}</h2>
            {share.project_description && <p className="whitespace-pre-wrap text-muted">{share.project_description}</p>}
          </div>
        </div>
      )}

      {share.scope === "project" && progress && <ProgressChart progress={progress} />}

      {posts.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">{t("empty")}</Card>
      ) : share.scope === "post" ? (
        <PostCard variant="shared" post={posts[0]} />
      ) : (
        <>
          <Timeline posts={posts} card={{ variant: "shared" }} />
          {hasMore && (
            <div className="text-center">
              <Link href={`/s/${token}?page=${pageNumber + 1}`} scroll={false} className={buttonClass("secondary")}>
                {t("loadMore")}
              </Link>
            </div>
          )}
        </>
      )}

      <p className="pt-4 text-center text-xs text-muted">{t("footer")}</p>
    </div>
  );
}
