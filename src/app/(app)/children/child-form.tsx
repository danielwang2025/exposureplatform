"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/app/(auth)/forms";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input, Select } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { FormState } from "@/lib/forms";
import { useLocalToday } from "@/components/use-local-today";

const visibilityOptions = ["private", "family", "link", "public"] as const;

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: { nickname: string; birthDate: string | null; maxVisibility: string };
  mode: "create" | "edit";
  disabled?: boolean;
};

export function ChildForm({ action, defaults, mode, disabled }: Props) {
  const t = useTranslations("child");
  const tv = useTranslations("visibility");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, formAction] = useActionState(action, null);
  const values = state?.values;
  const today = useLocalToday();

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      {state?.success && <Alert tone="success">{m(state.success)}</Alert>}
      <fieldset disabled={disabled} className="space-y-5">
        <Field label={t("nickname")} htmlFor="nickname" hint={t("nicknameHint")} error={m(state?.fieldErrors?.nickname)}>
          <Input id="nickname" name="nickname" maxLength={40} required defaultValue={values?.nickname ?? defaults?.nickname} />
        </Field>
        <Field label={t("birthDate")} htmlFor="birthDate" hint={t("birthDateHint")} error={m(state?.fieldErrors?.birthDate)}>
          <Input
            id="birthDate"
            name="birthDate"
            type="date"
            max={today}
            defaultValue={values?.birthDate ?? defaults?.birthDate ?? ""}
          />
        </Field>
        <Field
          label={t("maxVisibility")}
          htmlFor="maxVisibility"
          hint={t("maxVisibilityHint")}
          error={m(state?.fieldErrors?.maxVisibility)}
        >
          <Select id="maxVisibility" name="maxVisibility" defaultValue={values?.maxVisibility ?? defaults?.maxVisibility ?? "family"}>
            {visibilityOptions.map((v) => (
              <option key={v} value={v}>
                {tv(v)} — {tv(`${v}Hint`)}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "create" && (
          <Checkbox name="consent" label={t("guardianConsent")} error={m(state?.fieldErrors?.consent)} />
        )}
        {!disabled && (
          <SubmitButton pendingLabel={tAuth("submitting")}>{mode === "create" ? t("create") : t("save")}</SubmitButton>
        )}
      </fieldset>
    </form>
  );
}
