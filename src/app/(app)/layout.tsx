import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  // The proxy already redirects signed-out visitors; this is the server-side guarantee.
  await requireUser();
  return <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</div>;
}
