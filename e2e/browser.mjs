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

  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => watch(await newContext(options));
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
