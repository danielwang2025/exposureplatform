import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonClass, Card } from "@/components/ui";
import { visibilityIcons } from "@/components/timeline/post-card";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { listReports } from "@/lib/data/reports";
import { ChildHeader } from "../child-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tabs");
  return { title: t("reports") };
}

export default async function ReportsPage({ params }: PageProps<"/children/[childId]/reports">) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();

  const [t, tv, format, reports] = await Promise.all([
    getTranslations("reports"),
    getTranslations("visibility"),
    getFormatter(),
    listReports(child.id),
  ]);
  const canCreate = atLeast(child.role, "editor");
  const base = `/children/${child.id}/reports`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <ChildHeader child={child} active="reports" />

      {reports.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span aria-hidden className="text-4xl">📒</span>
          <p className="font-medium">{t("empty")}</p>
          <p className="max-w-sm text-sm text-muted">{canCreate ? t("emptyHint") : t("emptyHintViewer")}</p>
          {canCreate && (
            <Link href={`${base}/new`} className={buttonClass("primary", "mt-2")}>
              + {t("new")}
            </Link>
          )}
        </Card>
      ) : (
        <>
          {canCreate && (
            <div className="flex justify-end">
              <Link href={`${base}/new`} className={buttonClass("primary")}>
                + {t("new")}
              </Link>
            </div>
          )}
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id}>
                <Link
                  href={`${base}/${r.id}`}
                  className="block rounded-2xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary"
                >
                  <p className="font-semibold">{r.title}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {format.dateTimeRange(new Date(`${r.period_start}T00:00:00`), new Date(`${r.period_end}T00:00:00`), {
                      dateStyle: "medium",
                    })}{" "}
                    · {visibilityIcons[r.visibility]} {tv(r.visibility)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
