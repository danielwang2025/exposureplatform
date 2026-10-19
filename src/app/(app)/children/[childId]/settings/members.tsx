"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { SubmitButton } from "@/components/submit-button";
import { Alert, Button, Field, Input, Select } from "@/components/ui";
import { useMessage } from "@/components/use-message";
import type { MemberRole, PendingInvitation } from "@/lib/data/children";
import { changeMemberRole, deleteChild, inviteMember, removeMember, revokeInvitation } from "../../actions";

const roles = ["owner", "editor", "viewer"] as const;

export function MemberControls({
  childId,
  userId,
  name,
  role,
  isSelf,
}: {
  childId: string;
  userId: string;
  name: string;
  role: MemberRole;
  isSelf: boolean;
}) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Select
          aria-label={t("changeRole", { name })}
          value={role}
          disabled={pending}
          className="h-9 w-32"
          onChange={(event) => {
            const next = event.target.value;
            startTransition(async () => {
              const result = await changeMemberRole(childId, userId, next);
              setError(result.error);
            });
          }}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {tRoles(r)}
            </option>
          ))}
        </Select>
        {!isSelf && (
          <Button
            variant="ghost"
            className="h-9 text-danger"
            disabled={pending}
            onClick={() => {
              if (!window.confirm(t("removeConfirm", { name }))) return;
              startTransition(async () => {
                const result = await removeMember(childId, userId);
                setError(result?.error);
              });
            }}
          >
            {t("remove")}
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{m(error)}</p>}
    </div>
  );
}

export function InviteForm({ childId }: { childId: string }) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(inviteMember.bind(null, childId), null);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      {state?.success && (
        <Alert tone="success">
          {t(state.success === "members.inviteSent" ? "inviteSent" : "inviteCreated", {
            email: state.values?.invitedEmail ?? "",
          })}
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field label={t("inviteEmail")} htmlFor="invite-email" error={m(state?.fieldErrors?.email)}>
          <Input id="invite-email" name="email" type="email" autoComplete="off" required key={state?.success} />
        </Field>
        <Field label={t("inviteRole")} htmlFor="invite-role">
          <Select id="invite-role" name="role" defaultValue="viewer">
            <option value="viewer">{tRoles("viewer")}</option>
            <option value="editor">{tRoles("editor")}</option>
          </Select>
        </Field>
      </div>
      <p className="text-sm text-muted">
        {tRoles("viewer")}: {tRoles("viewerHint")} {tRoles("editor")}: {tRoles("editorHint")}
      </p>
      <SubmitButton pendingLabel={tAuth("submitting")}>{t("invite")}</SubmitButton>
    </form>
  );
}

export function PendingInvitations({ childId, invitations }: { childId: string; invitations: PendingInvitation[] }) {
  const t = useTranslations("members");
  const tRoles = useTranslations("roles");
  const format = useFormatter();

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("pendingTitle")}</h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{invitation.email}</p>
              <p className="text-xs text-muted">
                {tRoles(invitation.role)} ·{" "}
                {t("expires", { date: format.dateTime(new Date(invitation.expiresAt), { dateStyle: "medium" }) })}
              </p>
            </div>
            <CopyInviteLink token={invitation.token} />
            <RevokeButton childId={childId} invitationId={invitation.id} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyInviteLink({ token }: { token: string }) {
  const t = useTranslations("members");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      className="h-9"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/invite/${token}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}

function RevokeButton({ childId, invitationId }: { childId: string; invitationId: string }) {
  const t = useTranslations("members");
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      className="h-9 text-danger"
      disabled={pending}
      onClick={() => startTransition(async () => void (await revokeInvitation(childId, invitationId)))}
    >
      {t("revoke")}
    </Button>
  );
}

export function LeaveButton({ childId, userId, nickname }: { childId: string; userId: string; nickname: string }) {
  const t = useTranslations("child");
  const m = useMessage();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      {error && <Alert>{m(error)}</Alert>}
      <Button
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("leaveBody", { nickname }))) return;
          startTransition(async () => {
            const result = await removeMember(childId, userId);
            setError(result?.error);
          });
        }}
      >
        {t("leave")}
      </Button>
    </div>
  );
}

export function DeleteChildForm({ childId, nickname }: { childId: string; nickname: string }) {
  const t = useTranslations("child");
  const tAuth = useTranslations("auth");
  const m = useMessage();
  const [state, action] = useActionState(deleteChild.bind(null, childId), null);
  const [typed, setTyped] = useState("");

  return (
    <form action={action} className="space-y-3">
      <h3 className="font-medium">{t("deleteTitle")}</h3>
      <p className="text-sm text-muted">{t("deleteBody", { nickname })}</p>
      {state?.error && <Alert>{m(state.error)}</Alert>}
      <Field label={t("deleteConfirmLabel", { nickname })} htmlFor="confirm" error={m(state?.fieldErrors?.confirm)}>
        <Input id="confirm" name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
      </Field>
      <SubmitButton variant="danger" disabled={typed.trim() !== nickname} pendingLabel={tAuth("submitting")}>
        {t("delete")}
      </SubmitButton>
    </form>
  );
}
