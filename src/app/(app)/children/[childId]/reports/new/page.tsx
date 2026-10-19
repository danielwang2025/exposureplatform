import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { atLeast, getChild } from "@/lib/data/children";
import { MAX_HIGHLIGHTS } from "@/lib/data/reports";
import { createReport } from "../../../report-actions";
import { ReportForm } from "../report-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("reports");
  return { title: t("new") };
}

export default async function NewReportPage({ params }: PageProps<"/children/[childId]/reports/new">) {
  const { childId } = await params;
  const user = await requireUser();
  const child = await getChild(childId, user.id);
  if (!child || !atLeast(child.role, "editor")) notFound();
  const t = await getTranslations("reports");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href={`/children/${child.id}/reports`} className="text-sm text-primary hover:underline">
          ← {t("back")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">{t("newFor", { nickname: child.nickname })}</h1>
        <p className="text-sm text-muted">{t("newHint")}</p>
      </div>
      <Card>
        <ReportForm
          action={createReport.bind(null, child.id)}
          allowFamily={child.max_visibility !== "private"}
          maxHighlights={MAX_HIGHLIGHTS}
        />
      </Card>
    </div>
  );
}
