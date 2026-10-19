// Calendar dates (YYYY-MM-DD) without timezone surprises.

// Today on this device, e.g. for date inputs in the browser. toISOString()
// would give the UTC date: yesterday in Singapore before 8 am.
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The latest date that can be "today" somewhere on Earth: the server runs in
// UTC and no timezone is more than 14 hours ahead, so UTC today + 1 day.
export function latestPossibleToday(now = new Date()): string {
  return new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
}
