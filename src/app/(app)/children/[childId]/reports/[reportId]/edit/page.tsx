import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Alert, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getChild } from "@/lib/data/children";
import { canEditReport, getReport, listPeriodPhotos, MAX_HIGHLIGHTS } from "@/lib/data/reports";
import { updateReport } from "../../../../report-actions";
import { ReportForm } from "../../report-form";
import { DeleteReportButton } from "./delete-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports");
  return { title: t("edit") };
}

export default async function EditReportPage({
  params,
  searchParams,
}: PageProps<"/children/[childId]/reports/[reportId]/edit">) {
  const { childId, reportId } = await params;
  const { created } = await searchParams;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child) notFound();
  const report = await getReport(child.id, reportId);
  if (!report || !canEditReport(child, report, user.id)) notFound();

  const [t, photos] = await Promise.all([
    getTranslations("reports"),
    listPeriodPhotos(child.id, report.period_start, report.period_end),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/children/${child.id}/reports/${report.id}`} className="text-sm text-primary hover:underline">
          ← {report.title}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t("edit")}</h1>
      </div>
      {created && <Alert tone="success">{t("createdPickPhotos")}</Alert>}
      <Card>
        <ReportForm
          action={updateReport.bind(null, child.id, report.id)}
          // If the profile was narrowed to guardians-only, saving lowers the report too.
          allowFamily={child.max_visibility !== "private"}
          maxHighlights={MAX_HIGHLIGHTS}
          photos={photos}
          defaults={{
            title: report.title,
            periodStart: report.period_start,
            periodEnd: report.period_end,
            visibility: report.visibility as "private" | "family",
            summary: report.summary,
            highlights: report.highlight_media_ids,
          }}
        />
      </Card>
      <Card className="space-y-2 border-danger/40">
        <h2 className="font-medium">{t("deleteTitle")}</h2>
        <p className="text-sm text-muted">{t("deleteBody")}</p>
        <DeleteReportButton childId={child.id} reportId={report.id} />
      </Card>
    </div>
  );
}
