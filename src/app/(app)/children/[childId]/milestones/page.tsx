import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonClass, Card } from "@/components/ui";
import { ageParts } from "@/lib/age";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { listTimeline } from "@/lib/data/posts";
import { ChildHeader } from "../child-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tabs");
  return { title: t("milestones") };
}

export default async function MilestonesPage({ params }: PageProps<"/children/[childId]/milestones">) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();

  const [t, tc, format, { posts }] = await Promise.all([
    getTranslations("milestones"),
    getTranslations("child"),
    getFormatter(),
    listTimeline(child, user.id, { limit: 200, kind: "milestone", oldestFirst: true }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ChildHeader child={child} active="milestones" />

      {posts.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span aria-hidden className="text-4xl">🏆</span>
          <p className="font-medium">{t("empty")}</p>
          <p className="text-sm text-muted">{t("emptyHint")}</p>
          {atLeast(child.role, "editor") && (
            <Link href={`/children/${child.id}/posts/new`} className={buttonClass("primary", "mt-2")}>
              + {t("add")}
            </Link>
          )}
        </Card>
      ) : (
        <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {posts.map((post) => {
            const cover = post.media.find((m) => m.kind === "image" && m.thumbUrl);
            const date = new Date(`${post.occurredOn}T00:00:00`);
            const age =
              child.birth_date && post.occurredOn >= child.birth_date ? ageParts(child.birth_date, date) : null;
            return (
              <li key={post.id}>
                <Link
                  href={`/children/${child.id}/posts/${post.id}`}
                  className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:border-primary"
                >
                  <div className="flex aspect-[4/3] items-center justify-center bg-amber-50 text-4xl">
                    {cover ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cover.thumbUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span aria-hidden>🏆</span>
                    )}
                  </div>
                  <div className="space-y-0.5 p-3">
                    <p className="line-clamp-2 font-semibold leading-snug">{post.title || post.body}</p>
                    <p className="text-xs text-muted">
                      {age
                        ? age.years === 0
                          ? tc("ageMonths", { months: age.months })
                          : age.months === 0
                            ? tc("ageYears", { years: age.years })
                            : tc("ageYearsMonths", { years: age.years, months: age.months })
                        : format.dateTime(date, { dateStyle: "medium" })}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
