import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { RadarChart } from "@/components/charts/radar-chart";
import { TrendChart } from "@/components/charts/trend-chart";
import { buttonClass, Card, cn } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { getSkillHistory, isoDate, monthsBefore, scoreAsOf } from "@/lib/data/skill-history";
import { ChildHeader } from "../child-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tabs");
  return { title: t("skills") };
}

const compareOptions = [3, 6, 12] as const;
type Level = 1 | 2 | 3 | 4 | 5;

export default async function SkillsPage({ params, searchParams }: PageProps<"/children/[childId]/skills">) {
  const { childId } = await params;
  const { compare: compareParam } = await searchParams;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();

  const compare = compareOptions.find((m) => String(m) === compareParam) ?? 6;
  const [t, ts, format, history] = await Promise.all([
    getTranslations("skillsPage"),
    getTranslations("skills"),
    getFormatter(),
    getSkillHistory(child.id),
  ]);
  const canEdit = atLeast(child.role, "editor");
  const base = `/children/${child.id}`;

  const rated = history.filter((s) => s.points.length > 0);
  const active = history.filter((s) => !s.skill.archived_at);
  const today = isoDate(new Date());
  const beforeDate = monthsBefore(today, compare);
  const beforeLabel = t("monthsAgo", { months: compare });

  const rows = rated.map(({ skill, points }) => {
    const now = points.at(-1)!.score;
    const before = scoreAsOf(points, beforeDate);
    return { skill, points, now, before, change: before === null ? null : now - before };
  });
  const radarRows = rows.filter((r) => !r.skill.archived_at);
  const label = (s: { emoji: string | null; name: string }) => `${s.emoji ?? "⭐"} ${s.name}`;

  const allDates = rated.flatMap((s) => s.points.map((p) => p.occurredOn)).sort();
  const domain = { from: allDates[0], to: allDates.at(-1)! };
  const shortDate = (d: string) => format.dateTime(new Date(`${d}T00:00:00`), { year: "numeric", month: "short" });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ChildHeader child={child} active="skills" />

      {rated.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span aria-hidden className="text-4xl">🌱</span>
          <p className="font-medium">{active.length === 0 ? t("noSkills") : t("noRatings")}</p>
          <p className="max-w-sm text-sm text-muted">{active.length === 0 ? t("noSkillsHint") : t("noRatingsHint")}</p>
          {canEdit &&
            (active.length === 0 ? (
              <Link href={`${base}/settings`} className={buttonClass("primary", "mt-2")}>
                {t("setUpSkills")}
              </Link>
            ) : (
              <Link href={`${base}/posts/new?kind=review`} className={buttonClass("primary", "mt-2")}>
                + {t("writeReview")}
              </Link>
            ))}
        </Card>
      ) : (
        <>
          <nav aria-label={t("compareLabel")} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted">{t("compareLabel")}</span>
            {compareOptions.map((m) => (
              <Link
                key={m}
                href={`${base}/skills?compare=${m}`}
                aria-current={m === compare ? "true" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1",
                  m === compare ? "border-primary bg-primary-soft font-medium text-primary" : "border-border hover:bg-surface",
                )}
              >
                {t("monthsAgo", { months: m })}
              </Link>
            ))}
          </nav>

          <Card className="space-y-6">
            {radarRows.length >= 3 ? (
              <RadarChart
                axes={radarRows.map((r) => ({ id: r.skill.id, label: label(r.skill), now: r.now, before: r.before }))}
                labels={{ now: t("now"), before: beforeLabel, title: t("radarTitle", { nickname: child.nickname }) }}
                showBefore
              />
            ) : (
              <p className="text-sm text-muted">{t("radarNeedsThree")}</p>
            )}

            <table className="w-full text-sm">
              <caption className="sr-only">{t("tableCaption")}</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th scope="col" className="py-2 font-medium">{t("skill")}</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">{beforeLabel}</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">{t("now")}</th>
                  <th scope="col" className="py-2 pl-3 text-right font-medium">{t("change")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.skill.id}>
                    <th scope="row" className="py-2 text-left font-normal">
                      {label(r.skill)}
                      {r.skill.archived_at && <span className="text-muted"> · {ts("archivedBadge")}</span>}
                    </th>
                    <td className="py-2 pl-3 text-right text-muted">
                      {r.before === null ? "—" : <Score score={r.before} level={ts(`levels.${r.before as Level}`)} />}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <Score score={r.now} level={ts(`levels.${r.now as Level}`)} />
                    </td>
                    <td className="whitespace-nowrap py-2 pl-3 text-right tabular-nums">
                      {r.change === null ? (
                        <span className="text-muted">{t("new")}</span>
                      ) : r.change === 0 ? (
                        <span className="text-muted">±0</span>
                      ) : (
                        <span className="font-medium">
                          {r.change > 0 ? `↑ +${r.change}` : `↓ ${r.change}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted">{t("tableHint", { date: format.dateTime(new Date(`${beforeDate}T00:00:00`), { dateStyle: "medium" }) })}</p>
          </Card>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold">{t("trendsTitle")}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((r) => (
                <Card key={r.skill.id} className="space-y-2 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="truncate font-medium">{label(r.skill)}</h3>
                    <span className="shrink-0 text-xs text-muted">{t("reviewCount", { count: r.points.length })}</span>
                  </div>
                  <TrendChart
                    title={t("trendTitle", { skill: r.skill.name })}
                    domain={domain}
                    formatDate={shortDate}
                    points={r.points.map((p) => ({
                      date: p.occurredOn,
                      score: p.score,
                      href: `${base}/posts/${p.postId}`,
                      label: `${format.dateTime(new Date(`${p.occurredOn}T00:00:00`), { dateStyle: "medium" })} · ${p.score}/5 ${ts(`levels.${p.score as Level}`)}${p.title ? ` · ${p.title}` : ""}`,
                    }))}
                  />
                </Card>
              ))}
            </div>
            {active.some((s) => s.points.length === 0) && (
              <p className="text-sm text-muted">
                {t("notRatedYet", {
                  skills: active.filter((s) => s.points.length === 0).map((s) => label(s.skill)).join(", "),
                })}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// Level words only fit on wider screens; the number is always shown.
function Score({ score, level }: { score: number; level: string }) {
  return (
    <span title={level}>
      {score}
      <span className="hidden sm:inline"> · {level}</span>
    </span>
  );
}
