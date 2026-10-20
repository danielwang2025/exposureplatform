"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ProjectProgress, SkillProgress } from "@/lib/progress";

const TICKS = [1, 2, 3, 4, 5];
const position = (score: number) => `${((score - 1) / 4) * 100}%`;

// Dumbbell chart: per skill, the first and latest score on a shared 1–5 axis.
// One hue, two steps (lighter = first, darker = latest); the table view holds
// every assessment, so nothing is only reachable by hovering.
export function ProgressChart({ progress }: { progress: ProjectProgress }) {
  const t = useTranslations("skills");
  const [showTable, setShowTable] = useState(false);
  const multiple = progress.assessments.length > 1;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5" aria-labelledby="progress-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="progress-title" className="font-semibold">
            {t("progressTitle")}
          </h2>
          <p className="text-sm text-muted">
            {multiple ? t("progressSubtitle", { count: progress.assessments.length }) : t("progressSingle")}
          </p>
        </div>
        {multiple && (
          <ul className="flex items-center gap-4 text-xs text-muted" aria-label={t("legend")}>
            <li className="flex items-center gap-1.5">
              <Dot tone="first" />
              {t("first")}
            </li>
            <li className="flex items-center gap-1.5">
              <Dot tone="latest" />
              {t("latest")}
            </li>
          </ul>
        )}
      </div>

      <div>
        <ul className="space-y-1">
          {progress.skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </ul>
        {/* Shared 1–5 axis under the rows */}
        <div className="grid grid-cols-[1fr_4rem] gap-x-3 sm:grid-cols-[minmax(5rem,9rem)_1fr_4.5rem]" aria-hidden>
          <span className="hidden sm:block" />
          <div className="relative mx-2 h-4 text-[11px] tabular-nums text-muted">
            {TICKS.map((tick) => (
              <span key={tick} className="absolute -translate-x-1/2" style={{ left: position(tick) }}>
                {tick}
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowTable((v) => !v)}
        aria-expanded={showTable}
        className="text-sm text-primary hover:underline"
      >
        {showTable ? t("hideTable") : t("showTable")}
      </button>
      {showTable && <ProgressTable progress={progress} />}
    </section>
  );
}

function SkillRow({ skill }: { skill: SkillProgress }) {
  const t = useTranslations("skills");
  const format = useFormatter();
  const [hover, setHover] = useState(false);
  const changed = skill.count > 1 && skill.first.score !== skill.latest.score;
  const delta = skill.latest.score - skill.first.score;
  const lo = Math.min(skill.first.score, skill.latest.score);
  const hi = Math.max(skill.first.score, skill.latest.score);
  const date = (d: string) => format.dateTime(new Date(`${d}T00:00:00`), { dateStyle: "medium" });
  const summary =
    skill.count > 1
      ? t("rowSummary", { name: skill.name, first: skill.first.score, latest: skill.latest.score })
      : t("rowSummarySingle", { name: skill.name, latest: skill.latest.score });

  return (
    <li
      tabIndex={0}
      aria-label={summary}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      className="relative grid grid-cols-[1fr_4rem] items-center gap-x-3 rounded-lg py-1 sm:grid-cols-[minmax(5rem,9rem)_1fr_4.5rem] outline-none hover:bg-background focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <span className="col-span-2 truncate text-sm text-foreground sm:col-span-1" title={skill.name}>
        {skill.name}
      </span>

      <div className="relative mx-2 h-6" aria-hidden>
        {TICKS.map((tick) => (
          <span key={tick} className="absolute inset-y-0 w-px bg-viz-grid" style={{ left: position(tick) }} />
        ))}
        {changed && (
          <span
            className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-viz-first"
            style={{ left: position(lo), width: `${((hi - lo) / 4) * 100}%` }}
          />
        )}
        {changed && <Dot tone="first" className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: position(skill.first.score) }} />}
        <Dot tone="latest" className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: position(skill.latest.score) }} />
      </div>

      <span className="flex items-baseline justify-end gap-1.5 text-sm tabular-nums">
        <span className="font-semibold text-foreground">{skill.latest.score}</span>
        {skill.count > 1 && (
          <span className={delta > 0 ? "text-xs text-delta-up" : "text-xs text-muted"}>
            {delta > 0 ? `↑+${delta}` : delta < 0 ? `↓${delta}` : "→0"}
          </span>
        )}
      </span>

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-[min(9rem,30%)] top-full z-20 mt-1 min-w-48 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg"
        >
          <p className="mb-1 text-muted">{skill.name}</p>
          <p className="flex items-center gap-2">
            <Dot tone="latest" />
            <strong className="text-sm text-foreground">{skill.latest.score}</strong>
            <span className="text-muted">
              {t("latest")} · {date(skill.latest.date)}
            </span>
          </p>
          {skill.count > 1 && (
            <p className="flex items-center gap-2">
              <Dot tone="first" />
              <strong className="text-sm text-foreground">{skill.first.score}</strong>
              <span className="text-muted">
                {t("first")} · {date(skill.first.date)}
              </span>
            </p>
          )}
          <p className="mt-1 text-muted">{t("reviewCount", { count: skill.count })}</p>
        </div>
      )}
    </li>
  );
}

function ProgressTable({ progress }: { progress: ProjectProgress }) {
  const t = useTranslations("skills");
  const format = useFormatter();
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{t("tableCaption")}</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("date")}
            </th>
            {progress.skillNames.map((s) => (
              <th key={s.id} scope="col" className="px-2 py-2 text-right font-medium">
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {progress.assessments.map((a) => (
            <tr key={a.postId} className="border-b border-border last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-muted">
                {format.dateTime(new Date(`${a.date}T00:00:00`), { dateStyle: "medium" })}
              </th>
              {progress.skillNames.map((s) => (
                <td key={s.id} className="px-2 py-2 text-right">
                  {a.scores[s.id] ?? "–"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dot({
  tone,
  className = "",
  style,
}: {
  tone: "first" | "latest";
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      aria-hidden
      // 12px mark with a 2px surface ring so it stays legible over the line.
      className={`inline-block size-3 shrink-0 rounded-full ring-2 ring-surface ${tone === "first" ? "bg-viz-first" : "bg-viz-latest"} ${className}`}
      style={style}
    />
  );
}
