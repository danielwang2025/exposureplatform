// Suggested skills offered when setting up a child's list. Names come from
// messages (skills.presets.<key>) and are saved in the parent's language.
export const skillPresets = [
  { key: "language", emoji: "🗣️" },
  { key: "reading", emoji: "📚" },
  { key: "math", emoji: "🔢" },
  { key: "music", emoji: "🎵" },
  { key: "art", emoji: "🎨" },
  { key: "sports", emoji: "⚽" },
  { key: "social", emoji: "🤝" },
  { key: "independence", emoji: "🧦" },
  { key: "focus", emoji: "🎯" },
  { key: "curiosity", emoji: "🔭" },
] as const;

// 1–5, each with a word so a score means the same thing to every parent.
export const scoreLevels = [1, 2, 3, 4, 5] as const;
export type Score = (typeof scoreLevels)[number];
