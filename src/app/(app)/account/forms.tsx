"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Field, Input } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import { deleteAccount, updateDisplayName } from "./actions";

export function DisplayNameForm({ defaultValue }: { defaultValue: string }) {
  const t = useTranslations("account");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(updateDisplayName, null);

  return (
    <form action={action} className="space-y-3" noValidate>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      {state?.success && <Alert tone="success">{m(state.success)}</Alert>}
      <Field label={tAuth("displayName")} htmlFor="displayName" hint={tAuth("displayNameHint")} error={m(state?.fieldErrors?.displayName)}>
        <Input id="displayName" name="displayName" maxLength={60} defaultValue={state?.values?.displayName ?? defaultValue} />
      </Field>
      <SubmitButton variant="secondary" pendingLabel={tAuth("submitting")}>
        {t("save")}
      </SubmitButton>
    </form>
  );
}

export function DeleteAccountForm({ email }: { email: string }) {
  const t = useTranslations("account");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(deleteAccount, null);
  const [typed, setTyped] = useState("");

  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(event) => {
        if (!window.confirm(t("deleteFinalConfirm"))) event.preventDefault();
      }}
    >
      {state?.error && <Alert>{m(state.error)}</Alert>}
      <Field label={t("deleteConfirmLabel", { email })} htmlFor="confirm" error={m(state?.fieldErrors?.confirm)}>
        <Input id="confirm" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <Field label={tAuth("password")} htmlFor="delete-password" error={m(state?.fieldErrors?.password)}>
        <Input id="delete-password" name="password" type="password" autoComplete="current-password" />
      </Field>
      <SubmitButton
        variant="danger"
        disabled={typed.trim().toLowerCase() !== email.toLowerCase()}
        pendingLabel={tAuth("submitting")}
      >
        {t("deleteButton")}
      </SubmitButton>
    </form>
  );
}
