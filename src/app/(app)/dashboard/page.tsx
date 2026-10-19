import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChildAge, ChildAvatar } from "@/components/child-badge";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listMyChildren } from "@/lib/data/children";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const [t, tRoles, children] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("roles"),
    listMyChildren(user.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {children.length > 0 && (
          <Link href="/children/new" className={buttonClass("primary")}>
            + {t("addChild")}
          </Link>
        )}
      </div>

      {children.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span aria-hidden className="text-4xl">🌱</span>
          <p className="font-medium">{t("empty")}</p>
          <p className="text-sm text-muted">{t("emptyHint")}</p>
          <Link href="/children/new" className={buttonClass("primary", "mt-2")}>
            + {t("addChild")}
          </Link>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <li key={child.id}>
              <Link
                href={`/children/${child.id}`}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm transition hover:border-primary"
              >
                <ChildAvatar id={child.id} nickname={child.nickname} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{child.nickname}</p>
                  <p className="text-sm text-muted">
                    <ChildAge birthDate={child.birth_date} />
                  </p>
                  <p className="mt-1 text-xs text-muted">{tRoles(child.role)}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
