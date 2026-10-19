import type { ReactNode } from "react";
import { Card } from "@/components/ui";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="w-full max-w-sm space-y-4">
      <Card className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </Card>
      {footer && <p className="text-center text-sm text-muted">{footer}</p>}
    </div>
  );
}
