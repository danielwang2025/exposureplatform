// A 1–5 skill score: the number always, the level word ("Proficient") only
// where there's room. The word is in the title for small screens.
export function Score({ score, level }: { score: number; level: string }) {
  return (
    <span title={level}>
      {score}
      <span className="hidden sm:inline print:inline"> · {level}</span>
    </span>
  );
}
