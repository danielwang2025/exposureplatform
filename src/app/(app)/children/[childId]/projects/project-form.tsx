"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { Visibility } from "@/lib/data/children";
import type { FormState } from "@/lib/forms";

const visibilityOrder: Visibility[] = ["private", "family", "link", "public"];
const suggestions = ["🎹", "🏊", "⚽", "🎨", "📚", "🔬", "🩰", "🧩", "🎻", "🗣️"];

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  maxVisibility: Visibility;
  defaults?: { title: string; description: string; emoji: string | null; visibility: Visibility };
};

export function ProjectForm({ action, maxVisibility, defaults }: Props) {
  const t = useTranslations("projects");
  const tv = useTranslations("visibility");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, formAction] = useActionState(action, null);
  const values = state?.values;
  const allowed = visibilityOrder.slice(0, visibilityOrder.indexOf(maxVisibility) + 1);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Field label={t("emoji")} htmlFor="emoji">
          <Input
            id="emoji"
            name="emoji"
            maxLength={16}
            list="emoji-suggestions"
            className="text-center text-xl"
            defaultValue={values?.emoji ?? defaults?.emoji ?? ""}
          />
          <datalist id="emoji-suggestions">
            {suggestions.map((e) => (
              <option key={e} value={e} />
            ))}
          </datalist>
        </Field>
        <Field label={t("title")} htmlFor="title" error={m(state?.fieldErrors?.title)}>
          <Input id="title" name="title" maxLength={80} required placeholder={t("titlePlaceholder")} defaultValue={values?.title ?? defaults?.title} />
        </Field>
      </div>
      <Field label={t("description")} htmlFor="description" error={m(state?.fieldErrors?.description)}>
        <textarea
          id="description"
          name="description"
          rows={3}
          maxLength={1000}
          placeholder={t("descriptionPlaceholder")}
          defaultValue={values?.description ?? defaults?.description ?? ""}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </Field>
      <Field label={t("visibility")} htmlFor="visibility" hint={t("visibilityHint")}>
        <Select id="visibility" name="visibility" defaultValue={values?.visibility ?? defaults?.visibility ?? "family"}>
          {allowed.map((v) => (
            <option key={v} value={v}>
              {tv(v)}
            </option>
          ))}
        </Select>
      </Field>
      <SubmitButton pendingLabel={tAuth("submitting")}>{defaults ? t("save") : t("create")}</SubmitButton>
    </form>
  );
}
