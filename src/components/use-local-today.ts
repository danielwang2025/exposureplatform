"use client";

import { useSyncExternalStore } from "react";
import { localToday } from "@/lib/dates";

const subscribe = () => () => {};

// Today's date on this device. The server (UTC) renders its own date first;
// right after hydration this switches to the device's local date, so a
// Singapore user at 7 am sees today, not yesterday.
export function useLocalToday(): string {
  return useSyncExternalStore(subscribe, () => localToday(), () => new Date().toISOString().slice(0, 10));
}
