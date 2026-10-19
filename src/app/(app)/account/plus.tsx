"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Alert, Button, cn } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { BillingInterval, PlanPrice } from "@/lib/stripe";
import { openPortal, startCheckout } from "./billing-actions";

const months: Record<BillingInterval, number> = { month: 1, quarter: 3, half_year: 6, year: 12 };

export function PlusSection({
  plan,
  prices,
  flash,
}: {
  plan: { plus: boolean; status: string | null; interval: BillingInterval | null; periodEnd: string | null; cancelAtPeriodEnd: boolean; lockedCount: number };
  prices: PlanPrice[];
  flash?: "success" | "cancelled";
}) {
  const t = useTranslations("billing");
  const format = useFormatter();
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [interval, setInterval] = useState<BillingInterval>("year");

  const monthly = prices.find((p) => p.interval === "month");
  const money = (p: PlanPrice) => format.number(p.amount / 100, { style: "currency", currency: p.currency.toUpperCase() });
  const saving = (p: PlanPrice) =>
    monthly ? Math.round((1 - p.amount / (monthly.amount * months[p.interval])) * 100) : 0;

  function run(action: () => Promise<{ ok: false; error: string } | void>) {
    setError(undefined);
    startTransition(async () => {
      const result = await action();
      if (result) setError(result.error);
    });
  }

  return (
    <div className="space-y-4">
      {flash === "success" && <Alert tone="success">{t("checkoutSuccess")}</Alert>}
      {error && <Alert>{m(error)}</Alert>}
      {!plan.plus && plan.lockedCount > 0 && <Alert>{t("lockedNotice", { count: plan.lockedCount })}</Alert>}

      {plan.plus ? (
        <div className="space-y-3">
          <p className="font-medium">✨ {t("youHavePlus")}</p>
          <p className="text-sm text-muted">
            {plan.interval && t(`intervals.${plan.interval}`)}
            {plan.periodEnd &&
              ` · ${t(plan.cancelAtPeriodEnd ? "endsOn" : "renewsOn", {
                date: format.dateTime(new Date(plan.periodEnd), { dateStyle: "medium" }),
              })}`}
          </p>
          {plan.status === "past_due" && <Alert>{t("pastDue")}</Alert>}
          <Button variant="secondary" disabled={pending} onClick={() => run(openPortal)}>
            {t("manage")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-1.5 text-sm">
            <li>✓ {t("benefitStorage")}</li>
            <li>✓ {t("benefitVideo")}</li>
            <li>✓ {t("benefitAi")}</li>
            <li className="text-muted">✓ {t("benefitKeep")}</li>
          </ul>

          {prices.length === 0 ? (
            <p className="text-sm text-muted">{t("pricesUnavailable")}</p>
          ) : (
            <>
              <div role="radiogroup" aria-label={t("chooseInterval")} className="grid gap-2 sm:grid-cols-2">
                {prices.map((p) => (
                  <button
                    key={p.interval}
                    type="button"
                    role="radio"
                    aria-checked={interval === p.interval}
                    onClick={() => setInterval(p.interval)}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left",
                      interval === p.interval ? "border-primary bg-primary-soft" : "border-border hover:bg-background",
                    )}
                  >
                    <span>
                      <span className="block font-medium">{t(`intervals.${p.interval}`)}</span>
                      <span className="block text-sm text-muted">
                        {money(p)} / {t(`per.${p.interval}`)}
                      </span>
                    </span>
                    {saving(p) > 0 && (
                      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
                        {t("save", { percent: saving(p) })}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <Button disabled={pending} onClick={() => run(() => startCheckout(interval))}>
                {pending ? t("redirecting") : t("subscribe")}
              </Button>
              <p className="text-xs text-muted">{t("taxNote")}</p>
            </>
          )}
        </div>
      )}
      {flash === "cancelled" && !plan.plus && <p className="text-sm text-muted">{t("checkoutCancelled")}</p>}
    </div>
  );
}
