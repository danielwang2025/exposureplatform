// Launches Chromium for the e2e flows and fails the run if any page reports a
// Content-Security-Policy violation or an uncaught error.
import { chromium } from "playwright";

export async function launch() {
  const browser = await chromium.launch();
  const problems = [];

  const watch = (context) => {
    context.on("page", (page) => {
      page.on("console", (message) => {
        const text = message.text();
        if (/Content Security Policy|Refused to (load|execute|connect|apply|frame)/i.test(text)) {
          problems.push(`CSP: ${text} (${page.url()})`);
        }
      });
      page.on("pageerror", (error) => problems.push(`page error: ${error.message} (${page.url()})`));
    });
    return context;
  };

  // Each context looks like a different visitor (the app rate-limits by the
  // x-forwarded-for IP), unless a test sets its own header.
  const randomIp = () => `198.18.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 254)}`;
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options = {}) =>
    watch(
      await newContext({
        ...options,
        extraHTTPHeaders: { "x-forwarded-for": randomIp(), ...options.extraHTTPHeaders },
      }),
    );
  browser.newPage = async (options) => {
    const context = await browser.newContext(options);
    return context.newPage();
  };

  const close = browser.close.bind(browser);
  browser.close = async () => {
    await close();
    if (problems.length > 0) {
      throw new Error(`Browser problems:\n${[...new Set(problems)].join("\n")}`);
    }
  };
  return browser;
}
