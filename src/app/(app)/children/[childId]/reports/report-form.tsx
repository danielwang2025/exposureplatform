"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select, cn } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { FormState } from "@/lib/forms";

type Visibility = "private" | "family";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  // "private" when the child's profile is guardians-only.
  allowFamily: boolean;
  defaults?: {
    title: string;
    periodStart: string;
    periodEnd: string;
    visibility: Visibility;
    summary: string;
    highlights: string[];
  };
  // Edit mode only: photos from the saved period to pick highlights from.
  photos?: { id: string; thumbUrl: string; occurredOn: string }[];
  maxHighlights: number;
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function presets(today: Date) {
  const y = today.getFullYear();
  const m = today.getMonth();
  return {
    thisMonth: [new Date(y, m, 1), today],
    lastMonth: [new Date(y, m - 1, 1), new Date(y, m, 0)],
    last3Months: [new Date(y, m - 2, 1), today],
    thisYear: [new Date(y, 0, 1), today],
    lastYear: [new Date(y - 1, 0, 1), new Date(y - 1, 11, 31)],
  } as const;
}

export function ReportForm({ action, allowFamily, defaults, photos, maxHighlights }: Props) {
  const t = useTranslations("reports");
  const tv = useTranslations("visibility");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, formAction] = useActionState(action, null);
  const values = state?.values;

  const today = new Date();
  const ranges = presets(today);
  const [start, setStart] = useState(values?.periodStart ?? defaults?.periodStart ?? iso(ranges.thisMonth[0]));
  const [end, setEnd] = useState(values?.periodEnd ?? defaults?.periodEnd ?? iso(today));
  const [picked, setPicked] = useState<string[]>(defaults?.highlights ?? []);
  const periodChanged = Boolean(defaults && (start !== defaults.periodStart || end !== defaults.periodEnd));

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.error && <Alert>{m(state.error)}</Alert>}

      <Field label={t("titleField")} htmlFor="title" error={m(state?.fieldErrors?.title)}>
        <Input
          id="title"
          name="title"
          maxLength={80}
          required
          placeholder={t("titlePlaceholder")}
          defaultValue={values?.title ?? defaults?.title}
        />
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("period")}</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ranges) as (keyof typeof ranges)[]).map((key) => {
            const [from, to] = ranges[key].map(iso);
            const active = start === from && end === to;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setStart(from);
                  setEnd(to);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  active ? "border-primary bg-primary-soft font-medium text-primary" : "border-border hover:bg-background",
                )}
              >
                {t(`presets.${key}`)}
              </button>
            );
          })}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("periodStart")} htmlFor="periodStart" error={m(state?.fieldErrors?.periodStart)}>
            <Input id="periodStart" name="periodStart" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t("periodEnd")} htmlFor="periodEnd" error={m(state?.fieldErrors?.periodEnd)}>
            <Input id="periodEnd" name="periodEnd" type="date" required value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <Field label={t("visibility")} htmlFor="visibility" hint={t("visibilityHint")}>
        <Select id="visibility" name="visibility" defaultValue={values?.visibility ?? defaults?.visibility ?? (allowFamily ? "family" : "private")}>
          <option value="private">{tv("private")}</option>
          {allowFamily && <option value="family">{tv("family")}</option>}
        </Select>
      </Field>

      <Field label={t("summary")} htmlFor="summary" error={m(state?.fieldErrors?.summary)}>
        <textarea
          id="summary"
          name="summary"
          rows={6}
          maxLength={5000}
          placeholder={t("summaryPlaceholder")}
          defaultValue={values?.summary ?? defaults?.summary ?? ""}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </Field>

      {photos && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            {t("highlights")} <span className="font-normal text-muted">· {t("highlightsCount", { count: picked.length, max: maxHighlights })}</span>
          </legend>
          {periodChanged ? (
            <p className="text-sm text-muted">{t("highlightsAfterSave")}</p>
          ) : photos.length === 0 ? (
            <p className="text-sm text-muted">{t("noPhotos")}</p>
          ) : (
            <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {photos.map((photo) => {
                const checked = picked.includes(photo.id);
                const full = !checked && picked.length >= maxHighlights;
                return (
                  <li key={photo.id}>
                    <label
                      className={cn(
                        "relative block aspect-square cursor-pointer overflow-hidden rounded-lg ring-2 ring-offset-2 ring-offset-surface",
                        checked ? "ring-primary" : "ring-transparent",
                        full && "cursor-not-allowed opacity-40",
                      )}
                    >
                      <input
                        type="checkbox"
                        name="highlight"
                        value={photo.id}
                        checked={checked}
                        disabled={full}
                        onChange={() =>
                          setPicked((current) => (checked ? current.filter((id) => id !== photo.id) : [...current, photo.id]))
                        }
                        className="peer sr-only"
                        aria-label={t("pickPhoto", { date: photo.occurredOn })}
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.thumbUrl} alt="" className="size-full object-cover" />
                      {checked && (
                        <span className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                          {picked.indexOf(photo.id) + 1}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {/* Highlights picked before the period changed are kept until the next save. */}
          {periodChanged && picked.map((id) => <input key={id} type="hidden" name="highlight" value={id} />)}
        </fieldset>
      )}

      <SubmitButton pendingLabel={tAuth("submitting")}>{defaults ? t("save") : t("create")}</SubmitButton>
    </form>
  );
}
