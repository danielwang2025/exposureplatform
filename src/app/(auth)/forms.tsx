"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import { requestPasswordReset, signIn, signUp, updatePassword } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const t = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(signIn, null);

  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && <Alert>{m(state.error)}</Alert>}
      <Field label={t("email")} htmlFor="email" error={m(state?.fieldErrors?.email)}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
      </Field>
      <Field label={t("password")} htmlFor="password" error={m(state?.fieldErrors?.password)}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-primary hover:underline">
          {t("forgotPassword")}
        </Link>
      </div>
      <SubmitButton className="w-full" pendingLabel={t("submitting")}>
        {t("submitLogin")}
      </SubmitButton>
    </form>
  );
}

export function SignupForm({ next, email }: { next?: string; email?: string }) {
  const t = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(signUp, null);

  if (state?.success) return <Alert tone="success">{m(state.success)}</Alert>;

  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {state?.error && <Alert>{m(state.error)}</Alert>}
      <Field
        label={t("displayName")}
        htmlFor="displayName"
        hint={t("displayNameHint")}
        error={m(state?.fieldErrors?.displayName)}
      >
        <Input id="displayName" name="displayName" autoComplete="name" maxLength={60} required defaultValue={state?.values?.displayName} />
      </Field>
      <Field label={t("email")} htmlFor="email" error={m(state?.fieldErrors?.email)}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email ?? email} />
      </Field>
      <Field label={t("password")} htmlFor="password" hint={t("passwordHint")} error={m(state?.fieldErrors?.password)}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Checkbox name="guardian" label={t("guardianAttest")} error={m(state?.fieldErrors?.guardian)} />
      <Checkbox
        name="terms"
        label={t.rich("acceptTerms", {
          terms: (chunks) => (
            <Link href="/terms" target="_blank" className="text-primary underline">
              {chunks}
            </Link>
          ),
          privacy: (chunks) => (
            <Link href="/privacy" target="_blank" className="text-primary underline">
              {chunks}
            </Link>
          ),
        })}
        error={m(state?.fieldErrors?.terms)}
      />
      <SubmitButton className="w-full" pendingLabel={t("submitting")}>
        {t("submitSignup")}
      </SubmitButton>
    </form>
  );
}

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(requestPasswordReset, null);

  if (state?.success) return <Alert tone="success">{m(state.success)}</Alert>;

  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      <Field label={t("email")} htmlFor="email" error={m(state?.fieldErrors?.email)}>
        <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={state?.values?.email} />
      </Field>
      <SubmitButton className="w-full" pendingLabel={t("submitting")}>
        {t("sendResetLink")}
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(updatePassword, null);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      <Field label={t("newPassword")} htmlFor="password" hint={t("passwordHint")} error={m(state?.fieldErrors?.password)}>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <SubmitButton className="w-full" pendingLabel={t("submitting")}>
        {t("savePassword")}
      </SubmitButton>
    </form>
  );
}

export function Checkbox({ name, label, error }: { name: string; label: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name={name} className="mt-0.5 size-4 accent-primary" required />
        <span>{label}</span>
      </label>
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
