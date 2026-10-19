// Test images for the e2e flows: a JPEG carrying EXIF metadata (to prove it's
// stripped) and a large PNG (to prove it's resized).
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const out = new URL("./.output/fixtures/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
mkdirSync(new URL("./.output/shots/", import.meta.url).pathname, { recursive: true });

await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 120, g: 180, b: 220 } } })
  .composite([{ input: Buffer.from('<svg width="1600" height="1200"><text x="100" y="600" font-size="200" fill="white">GPS photo</text></svg>') }])
  .jpeg()
  .withExif({ IFD0: { Make: "TestPhone", Model: "X1", Copyright: "secret-home" } })
  .toFile(`${out}gps.jpg`);
await sharp({ create: { width: 5000, height: 3000, channels: 4, background: { r: 250, g: 200, b: 80, alpha: 1 } } })
  .composite([{ input: Buffer.from('<svg width="5000" height="3000"><circle cx="2500" cy="1500" r="1200" fill="#2f855a"/></svg>') }])
  .png()
  .toFile(`${out}big.png`);
console.log(`fixtures written to ${out}`);
