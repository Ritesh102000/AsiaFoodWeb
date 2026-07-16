import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { spawn } from "node:child_process";

const port = 3317;
let server;

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Next.js production server did not start");
}

before(async () => {
  server = spawn("./node_modules/.bin/next", ["start", "--port", String(port), "--hostname", "127.0.0.1"], {
    stdio: "ignore",
  });
  await waitForServer();
});

after(() => server?.kill("SIGTERM"));

test("home page renders AFC storefront and assistant", async () => {
  const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.match(html, /AFC Grocery/);
  assert.match(html, /AFC Assistant/);
  assert.match(html, /Fresh arrivals/);
});

test("catalog and admin routes render", async () => {
  const catalog = await (await fetch(`http://127.0.0.1:${port}/shop`)).text();
  const admin = await (await fetch(`http://127.0.0.1:${port}/admin`)).text();
  assert.match(catalog, /100 products/);
  assert.match(catalog, /Find your favourites/);
  assert.match(admin, /Admin access/);
});
