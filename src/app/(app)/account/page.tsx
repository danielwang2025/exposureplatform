import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonClass, Card } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getAccount, listSoleOwnedChildren } from "@/lib/data/account";
import { DeleteAccountForm, DisplayNameForm } from "./forms";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("title") };
}

export default async function AccountPage() {
  const user = await requireUser();
  const [t, format, account, soleOwned] = await Promise.all([
    getTranslations("account"),
    getFormatter(),
    getAccount(user.id),
    listSoleOwnedChildren(user.id),
  ]);
  const used = account.storageUsed / account.storageQuota;
  const bytes = (n: number) =>
    n >= 1024 ** 3
      ? `${format.number(n / 1024 ** 3, { maximumFractionDigits: 1 })} GB`
      : n >= 1024 ** 2
        ? `${format.number(n / 1024 ** 2, { maximumFractionDigits: n < 10 * 1024 ** 2 ? 1 : 0 })} MB`
        : `${format.number(Math.ceil(n / 1024))} KB`;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("profileTitle")}</h2>
        <Card className="space-y-4">
          <p className="text-sm">
            <span className="text-muted">{t("email")}:</span> {user.email}
          </p>
          <DisplayNameForm defaultValue={account.displayName} />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("storageTitle")}</h2>
        <Card className="space-y-2">
          <div
            role="meter"
            aria-label={t("storageTitle")}
            aria-valuemin={0}
            aria-valuemax={account.storageQuota}
            aria-valuenow={account.storageUsed}
            className="h-2.5 overflow-hidden rounded-full bg-background ring-1 ring-border"
          >
            <div
              className={used > 0.9 ? "h-full bg-danger" : "h-full bg-primary"}
              style={{ width: `${Math.min(100, Math.max(used > 0 ? 1 : 0, used * 100))}%` }}
            />
          </div>
          <p className="text-sm">
            {t("storageUsed", { used: bytes(account.storageUsed), total: bytes(account.storageQuota) })}
          </p>
          <p className="text-xs text-muted">{t("storageHint")}</p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t("exportTitle")}</h2>
        <Card className="space-y-3">
          <p className="text-sm text-muted">{t("exportBody")}</p>
          <a href="/account/export" className={buttonClass("secondary")} download>
            ⬇ {t("exportButton")}
          </a>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-danger">{t("deleteTitle")}</h2>
        <Card className="space-y-4 border-danger/40">
          <p className="text-sm text-muted">{t("deleteBody")}</p>
          {soleOwned.length > 0 && (
            <div className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              <p>{t("deleteChildren")}</p>
              <ul className="mt-1 list-inside list-disc font-medium">
                {soleOwned.map((c) => (
                  <li key={c.id}>{c.nickname}</li>
                ))}
              </ul>
              <p className="mt-1">{t("deleteChildrenHint")}</p>
            </div>
          )}
          <DeleteAccountForm email={user.email} />
        </Card>
      </section>
    </div>
  );
}
