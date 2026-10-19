import type { ReactNode } from "react";

// DRAFT legal text. Replace every [bracketed] placeholder and have the final
// wording reviewed by a lawyer for the markets you launch in.
export const LEGAL_UPDATED = "2026-10-19";

export type LegalSection = { heading: string; body: ReactNode };

export function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
  return (
    <article className="mx-auto w-full max-w-2xl space-y-8 px-4 py-12">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold">{title}</h1>
        <p className="text-sm text-muted">{updated}</p>
      </header>
      {sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          <div className="space-y-2 text-sm leading-relaxed [&_li]:ml-5 [&_li]:list-disc">{section.body}</div>
        </section>
      ))}
    </article>
  );
}
