"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { createShareLink, revokeShareLink, setPublicAddress } from "@/app/(app)/children/share-actions";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { ShareLink } from "@/lib/data/sharing";

export function PublicAddressForm({
  childId,
  slug,
  isPublic,
}: {
  childId: string;
  slug: string | null;
  isPublic: boolean;
}) {
  const t = useTranslations("sharing");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(setPublicAddress.bind(null, childId), null);
  const current = state?.success ? state.values?.slug || null : slug;

  return (
    <form action={action} className="space-y-3" noValidate>
      <div>
        <h3 className="font-medium">{t("publicTitle")}</h3>
        <p className="text-sm text-muted">{t("publicBody")}</p>
      </div>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      {state?.success && <Alert tone="success">{m(state.success)}</Alert>}
      <Field label={t("address")} htmlFor="slug" hint={t("addressHint")} error={m(state?.fieldErrors?.slug)}>
        <div className="flex items-center rounded-lg border border-border bg-surface focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <span className="pl-3 text-sm text-muted">/c/</span>
          <input
            id="slug"
            name="slug"
            maxLength={40}
            autoComplete="off"
            spellCheck={false}
            placeholder="mia-adventures"
            defaultValue={state?.values?.slug ?? slug ?? ""}
            className="h-10 w-full bg-transparent pr-3 text-sm focus:outline-none"
          />
        </div>
      </Field>
      <SubmitButton variant="secondary" pendingLabel={tAuth("submitting")}>
        {t("saveAddress")}
      </SubmitButton>
      {current &&
        (isPublic ? (
          <p className="text-sm">
            {t("liveAt")}{" "}
            <a href={`/c/${current}`} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
              /c/{current}
            </a>
          </p>
        ) : (
          <p className="text-sm text-muted">{t("notLive")}</p>
        ))}
    </form>
  );
}

export function ShareLinks({
  childId,
  links,
  shareable,
}: {
  childId: string;
  links: ShareLink[];
  shareable: boolean;
}) {
  const t = useTranslations("sharing");
  const format = useFormatter();
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<string>();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">{t("linksTitle")}</h3>
        <p className="text-sm text-muted">{t("linksBody")}</p>
      </div>

      {!shareable ? (
        <p className="rounded-lg bg-background px-3 py-2 text-sm text-muted">{t("errors.profileNotShareable")}</p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-[1fr_9rem_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await createShareLink(childId, {
                scope: "child",
                label: String(form.get("label") ?? ""),
                expires: String(form.get("expires")) as "never" | "7" | "30",
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setError(undefined);
              const url = `${window.location.origin}/s/${result.token}`;
              await navigator.clipboard.writeText(url).catch(() => {});
              setCreated(url);
            });
          }}
        >
          <Field label={t("label")} htmlFor="link-label">
            <Input id="link-label" name="label" maxLength={60} placeholder={t("labelPlaceholder")} />
          </Field>
          <Field label={t("expires")} htmlFor="link-expires">
            <Select id="link-expires" name="expires" defaultValue="never">
              <option value="never">{t("expiresNever")}</option>
              <option value="7">{t("expiresDays", { days: 7 })}</option>
              <option value="30">{t("expiresDays", { days: 30 })}</option>
            </Select>
          </Field>
          <Button type="submit" disabled={pending}>
            {t("createLink")}
          </Button>
        </form>
      )}
      {error && <Alert>{m(error)}</Alert>}
      {created && (
        <Alert tone="success">
          {t("copiedNew")} <span className="block break-all font-mono text-xs">{created}</span>
        </Alert>
      )}

      {links.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {links.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {link.label || link.target || t(`scopes.${link.scope}`)}
                  {link.label && link.target && <span className="font-normal text-muted"> · {link.target}</span>}
                </p>
                <p className="text-xs text-muted">
                  {t(`scopes.${link.scope}`)} · {t("views", { count: link.viewCount })}
                  {link.expiresAt &&
                    ` · ${t("expiresOn", { date: format.dateTime(new Date(link.expiresAt), { dateStyle: "medium" }) })}`}
                </p>
              </div>
              <CopyButton url={`/s/${link.token}`} />
              <Button
                variant="ghost"
                className="h-9 text-danger"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(t("revokeConfirm"))) return;
                  startTransition(async () => {
                    const result = await revokeShareLink(childId, link.id);
                    setError(result.error);
                  });
                }}
              >
                {t("revoke")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyButton({ url }: { url: string }) {
  const t = useTranslations("members");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="h-9"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}
