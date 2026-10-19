import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SharedHeader } from "@/components/timeline/shared-header";
import { Timeline } from "@/components/timeline/timeline";
import { buttonClass, Card } from "@/components/ui";
import { getPublicView } from "@/lib/data/sharing";

const slugPattern = /^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/i;

export async function generateMetadata({ params }: PageProps<"/c/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const view = slugPattern.test(slug) ? await getPublicView(slug, 1) : null;
  return { title: view?.child.child_nickname };
}

export default async function PublicChildPage({ params, searchParams }: PageProps<"/c/[slug]">) {
  const { slug } = await params;
  const { page } = await searchParams;
  if (!slugPattern.test(slug)) notFound();

  const pageNumber = Math.max(1, Math.min(50, Number(page) || 1));
  const view = await getPublicView(slug, pageNumber);
  if (!view) notFound();
  const { child, posts, hasMore } = view;
  const t = await getTranslations("shared");

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8">
      <SharedHeader
        seed={slug}
        nickname={child.child_nickname}
        ageYears={child.child_age_years}
        banner={t("publicBanner", { nickname: child.child_nickname })}
      />

      {posts.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">{t("empty")}</Card>
      ) : (
        <>
          <Timeline posts={posts} card={{ variant: "shared" }} />
          {hasMore && (
            <div className="text-center">
              <Link href={`/c/${slug}?page=${pageNumber + 1}`} scroll={false} className={buttonClass("secondary")}>
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
