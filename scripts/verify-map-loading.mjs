import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Run against a local server with access enabled (or supply a private storage state).
const base = process.env.PARCEL_MAP_TEST_URL ?? "http://127.0.0.1:3100";
const browser = process.env.PARCEL_MAP_TEST_CDP_URL
  ? await chromium.connectOverCDP(process.env.PARCEL_MAP_TEST_CDP_URL)
  : await chromium.launch();
const report = [];
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const isTopo = url => url.includes("/USGSTopo/MapServer/tile/");
const isImagery = url => url.includes("/Michigan_imagery_public/MapServer/tile/");
const isLabel = url => url.includes("/Reference/") && url.includes("/MapServer/tile/");
const isParcel = url => url.includes("/api/parcels/tiles/") || url.includes("/api/parcels/bbox?");

async function checkLoading(vectorTiles) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ...(process.env.PARCEL_MAP_TEST_STORAGE_STATE ? { storageState: process.env.PARCEL_MAP_TEST_STORAGE_STATE } : {})
  });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  let releaseTopo, releaseImagery;
  const topoGate = new Promise(resolve => { releaseTopo = resolve; });
  const imageryGate = new Promise(resolve => { releaseImagery = resolve; });
  const started = performance.now();
  page.on("request", r => requests.push({ url: r.url(), ms: performance.now() - started }));
  page.on("pageerror", error => errors.push(error.message));
  // Deterministic public-tile fixtures isolate scheduling from provider/network speed.
  await page.route("**/MapServer/tile/**", async route => {
    if (isTopo(route.request().url())) await topoGate;
    if (isImagery(route.request().url())) await imageryGate;
    await route.fulfill({ contentType: "image/png", body: pixel }).catch(() => {});
  });
  if (!vectorTiles) await page.route("**/api/auth/session", async route => {
    const response = await route.fetch();
    const payload = await response.json();
    assert.equal(payload.data.authenticated, true, "Sign in or provide a test storage state first.");
    payload.data.vectorTilesAvailable = false;
    await route.fulfill({ response, json: payload });
  });

  try {
    const topoStarted = page.waitForRequest(r => isTopo(r.url()));
    const parcelsStarted = page.waitForRequest(r => isParcel(r.url()), { timeout: 10000 });
    await page.goto(base);
    await topoStarted;
    const imageryStarted = page.waitForRequest(r => isImagery(r.url()), { timeout: 5000 });
    const clicked = performance.now() - started;
    await page.getByRole("button", { name: "Satellite", exact: true }).click();
    await imageryStarted;
    await parcelsStarted;
    assert.equal(requests.filter(r => isLabel(r.url)).length, 0, "Labels must wait for first-view imagery.");
    const firstImageryMs = requests.find(r => isImagery(r.url)).ms - clicked;
    const firstParcelMs = requests.find(r => isParcel(r.url)).ms;
    const labelsStarted = page.waitForRequest(r => isLabel(r.url()), { timeout: 10000 });
    releaseImagery();
    await labelsStarted;
    // Topo remains blocked through the assertions above.
    releaseTopo();
    await page.getByRole("button", { name: "Map layers", exact: true }).click();
    await page.getByRole("checkbox", { name: /Parcel boundaries/ }).uncheck();
    await page.waitForTimeout(400); // let already queued movement/debounce work settle
    const beforePan = requests.filter(r => isParcel(r.url)).length;
    await page.getByRole("button", { name: /Marquette Lake Superior/ }).click();
    await page.waitForFunction(() => document.querySelector(".coordinate-readout")?.textContent.includes("46.54360"), null, { timeout: 10000 });
    await page.waitForTimeout(1500); // covers the map fly animation and bbox debounce
    assert.equal(requests.filter(r => isParcel(r.url)).length, beforePan, "Hidden boundaries must not fetch on pan.");
    const resumed = page.waitForRequest(r => isParcel(r.url()), { timeout: 10000 });
    await page.getByRole("checkbox", { name: /Parcel boundaries/ }).check();
    await resumed;
    assert.deepEqual(errors, []);
    report.push({ mode: vectorTiles ? "vector" : "geojson", firstImageryAfterClickMs: Math.round(firstImageryMs),
      firstParcelRequestMs: Math.round(firstParcelMs), topoBlockedDuringStartup: true,
      labelsDeferredUntilImagery: true, hiddenPanParcelRequests: 0, boundariesResume: true });
  } catch (error) {
    console.error(JSON.stringify({ mode: vectorTiles ? "vector" : "geojson", errors,
      ui: await page.evaluate(() => ({ hash: location.hash, coordinate: document.querySelector(".coordinate-readout")?.textContent })),
      requestCounts: { imagery: requests.filter(r => isImagery(r.url)).length, labels: requests.filter(r => isLabel(r.url)).length } }));
    throw error;
  } finally {
    releaseTopo(); releaseImagery(); await context.close();
  }
}

try {
  await checkLoading(true);
  await checkLoading(false);
  await mkdir("work", { recursive: true });
  await writeFile("work/map-loading-verification.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
