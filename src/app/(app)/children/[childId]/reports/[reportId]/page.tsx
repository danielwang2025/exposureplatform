import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { RadarChart } from "@/components/charts/radar-chart";
import { Score } from "@/components/score";
import { buttonClass, cn } from "@/components/ui";
import { visibilityIcons } from "@/components/timeline/post-card";
import { ageParts } from "@/lib/age";
import { requireUser } from "@/lib/auth";
import { getChild } from "@/lib/data/children";
import { buildReport, canEditReport, getReport } from "@/lib/data/reports";
import { PrintButton } from "./print-button";

type Level = 1 | 2 | 3 | 4 | 5;

export async function generateMetadata({ params }: PageProps<"/children/[childId]/reports/[reportId]">): Promise<Metadata> {
  const { childId, reportId } = await params;
  const report = await getReport(childId, reportId).catch(() => null);
  const t = await getTranslations("reports");
  return { title: report?.title ?? t("title") };
}

export default async function ReportPage({ params }: PageProps<"/children/[childId]/reports/[reportId]">) {
  const { childId, reportId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();
  const report = await getReport(child.id, reportId);
  if (!report) notFound();

  const [t, ts, tc, tv, format, content] = await Promise.all([
    getTranslations("reports"),
    getTranslations("skills"),
    getTranslations("child"),
    getTranslations("visibility"),
    getFormatter(),
    buildReport(report),
  ]);
  const base = `/children/${child.id}`;
  const day = (d: string) => new Date(`${d}T00:00:00`);
  const age = child.birth_date ? ageParts(child.birth_date, day(report.period_end)) : null;
  const ageLabel = age
    ? age.years === 0
      ? tc("ageMonths", { months: age.months })
      : age.months === 0
        ? tc("ageYears", { years: age.years })
        : tc("ageYearsMonths", { years: age.years, months: age.months })
    : null;
  const { counts } = content;
  const stats: { key: Exclude<keyof typeof counts, "moments">; value: number }[] = [
    { key: "posts", value: counts.posts },
    { key: "milestones", value: counts.milestones },
    { key: "reviews", value: counts.reviews },
    { key: "photos", value: counts.photos },
    ...(counts.videos > 0 ? [{ key: "videos" as const, value: counts.videos }] : []),
  ];
  const radarSkills = content.skills.filter((s) => s.start !== null);
  const label = (s: { emoji: string | null; name: string }) => `${s.emoji ?? "⭐"} ${s.name}`;

  return (
    <article className="mx-auto max-w-2xl space-y-8 print:max-w-none print:space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`${base}/reports`} className="text-sm text-primary hover:underline">
          ← {t("back")}
        </Link>
        <div className="flex gap-2">
          {canEditReport(child, report, user.id) && (
            <Link href={`${base}/reports/${report.id}/edit`} className={buttonClass("secondary")}>
              {t("edit")}
            </Link>
          )}
          <PrintButton />
        </div>
      </div>

      <header className="space-y-1 border-b border-border pb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{t("kicker", { nickname: child.nickname })}</p>
        <h1 className="text-3xl font-semibold">{report.title}</h1>
        <p className="text-muted">
          {format.dateTimeRange(day(report.period_start), day(report.period_end), { dateStyle: "long" })}
          {ageLabel && <> · {t("ageAtEnd", { age: ageLabel })}</>}
        </p>
        <p className="text-xs text-muted print:hidden">
          {visibilityIcons[report.visibility]} {tv(report.visibility)}
        </p>
      </header>

      <section aria-labelledby="glance" className="space-y-3">
        <h2 id="glance" className="text-lg font-semibold">{t("atAGlance")}</h2>
        <dl className={cn("grid gap-3", stats.length === 5 ? "grid-cols-3 sm:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
          {stats.map((s) => (
            <div key={s.key} className="rounded-xl border border-border bg-surface p-3 break-inside-avoid">
              <dt className="text-xs text-muted">{t(`stats.${s.key}`)}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {report.summary && (
        <section aria-labelledby="summary" className="space-y-2 break-inside-avoid">
          <h2 id="summary" className="text-lg font-semibold">{t("summaryHeading")}</h2>
          <p className="whitespace-pre-wrap leading-relaxed">{report.summary}</p>
        </section>
      )}

      {content.highlights.length > 0 && (
        <section aria-labelledby="highlights" className="space-y-3 break-inside-avoid">
          <h2 id="highlights" className="text-lg font-semibold">{t("highlights")}</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {content.highlights.map((photo) => (
              <li key={photo.id} className="overflow-hidden rounded-xl">
                <Link href={`${base}/posts/${photo.postId}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.fullUrl ?? photo.thumbUrl} alt="" className="aspect-square w-full object-cover" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.skills.length > 0 && (
        <section aria-labelledby="skills" className="space-y-4">
          <h2 id="skills" className="text-lg font-semibold">{t("skillsTitle")}</h2>
          {radarSkills.length >= 3 && (
            <div className="break-inside-avoid">
              <RadarChart
                axes={radarSkills.map((s) => ({ id: s.id, label: label(s), now: s.end, before: s.start }))}
                labels={{ now: t("endOfPeriod"), before: t("startOfPeriod"), title: t("radarTitle") }}
                showBefore
              />
            </div>
          )}
          <table className="w-full text-sm break-inside-avoid">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="py-2 font-medium">{ts("ratingsTitle")}</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">{t("startOfPeriod")}</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">{t("endOfPeriod")}</th>
                <th scope="col" className="py-2 pl-3 text-right font-medium">{t("change")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {content.skills.map((s) => {
                const change = s.start === null ? null : s.end - s.start;
                return (
                  <tr key={s.id}>
                    <th scope="row" className="py-2 text-left font-normal">
                      {label(s)}
                      <span className="block text-xs text-muted">{t("reviewsInPeriod", { count: s.reviewsInPeriod })}</span>
                    </th>
                    <td className="py-2 pl-3 text-right text-muted">
                      {s.start === null ? "—" : <Score score={s.start} level={ts(`levels.${s.start as Level}`)} />}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <Score score={s.end} level={ts(`levels.${s.end as Level}`)} />
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right font-medium tabular-nums">
                      {change === null || change === 0 ? (
                        <span className="font-normal text-muted">{change === 0 ? "±0" : "—"}</span>
                      ) : change > 0 ? (
                        `↑ +${change}`
                      ) : (
                        `↓ ${change}`
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {content.milestones.length > 0 && (
        <section aria-labelledby="milestones" className="space-y-3 break-inside-avoid">
          <h2 id="milestones" className="text-lg font-semibold">🏆 {t("milestones")}</h2>
          <ol className="space-y-2">
            {content.milestones.map((ms) => (
              <li key={ms.id} className="flex gap-3">
                <time dateTime={ms.occurredOn} className="w-28 shrink-0 text-sm text-muted">
                  {format.dateTime(day(ms.occurredOn), { dateStyle: "medium" })}
                </time>
                <Link href={`${base}/posts/${ms.id}`} className="hover:underline">
                  {ms.title}
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {content.projects.length > 0 && (
        <section aria-labelledby="projects" className="space-y-3 break-inside-avoid">
          <h2 id="projects" className="text-lg font-semibold">{t("projects")}</h2>
          <ul className="flex flex-wrap gap-2">
            {content.projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`${base}/projects/${p.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-sm text-primary"
                >
                  {p.emoji ?? "📁"} {p.title} <span className="text-xs opacity-80">· {t("projectPosts", { count: p.posts })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {counts.posts === 0 && content.skills.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted">{t("nothingInPeriod")}</p>
      )}

      <footer className="border-t border-border pt-4 text-xs text-muted">
        {t("footer", { date: format.dateTime(new Date(), { dateStyle: "medium" }) })}
      </footer>
    </article>
  );
}
