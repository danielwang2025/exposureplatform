import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, localeCookie, type Locale } from "./config";

async function resolveLocale(): Promise<Locale> {
  const fromCookie = (await cookies()).get(localeCookie)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  // First visit: honour a Chinese browser, otherwise English.
  const acceptLanguage = (await headers()).get("accept-language") ?? "";
  return /^zh\b/i.test(acceptLanguage.trim()) ? "zh" : defaultLocale;
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
