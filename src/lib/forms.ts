import { z } from "zod";

// What every form action returns to useActionState. Error values are message
// keys so the client renders them in the current language.
export type FormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: string;
  values?: Record<string, string>;
} | null;

export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!(key in result)) result[key] = issue.message;
  }
  return result;
}

export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map((key) => [key, String(formData.get(key) ?? "")]));
}

export const checkbox = z
  .union([z.literal("on"), z.null()])
  .refine((value) => value === "on", "validation.mustAgree");

export const email = z.string().trim().toLowerCase().pipe(z.email("validation.email"));
export const password = z.string().min(8, "validation.passwordMin").max(72, "validation.passwordMin");
