// The public downloads page: lists the APKs (newest first), serves them, and
// nothing else from the folder.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

describe("releases", () => {
  let dir: string;
  let app: FastifyInstance;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "oob-releases-"));
    await mkdir(join(dir, "old"));
    await mkdir(join(dir, "play"));
    await writeFile(join(dir, "outofbook-offline-1.14.apk"), "apk 1.14");
    await writeFile(join(dir, "outofbook-twa-1.1.apk"), "twa");
    await writeFile(join(dir, "old", "outofbook-offline-1.9.apk"), "apk 1.9");
    await writeFile(join(dir, "old", "outofbook-offline-1.13.apk"), "apk 1.13");
    await writeFile(join(dir, "play", "outofbook-offline-1.14.aab"), "bundle");
    await writeFile(join(dir, "notes.txt"), "private");
    app = await buildApp({ pool: {} as pg.Pool, unlimited: new Set(), devAuth: false, releasesDir: dir });
  });
  afterAll(async () => {
    await app?.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("lists each app's newest build first, older ones after", async () => {
    const r = await app.inject({ url: "/releases" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/html/);
    const html = r.body;
    expect(html.indexOf("outofbook-offline-1.14.apk")).toBeLessThan(html.indexOf("outofbook-offline-1.13.apk"));
    expect(html.indexOf("outofbook-offline-1.13.apk")).toBeLessThan(html.indexOf("outofbook-offline-1.9.apk"));
    expect(html).toContain("outofbook-twa-1.1.apk");
    expect(html).not.toContain(".aab");
  });

  it("serves an APK as a download, from the folder or old/", async () => {
    const r = await app.inject({ url: "/releases/outofbook-offline-1.14.apk" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("application/vnd.android.package-archive");
    expect(r.headers["content-disposition"]).toContain("outofbook-offline-1.14.apk");
    expect(r.body).toBe("apk 1.14");
    expect((await app.inject({ url: "/releases/outofbook-offline-1.9.apk" })).body).toBe("apk 1.9");
  });

  it("points latest.apk at the newest offline app", async () => {
    const r = await app.inject({ url: "/releases/latest.apk" });
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe("/releases/outofbook-offline-1.14.apk");
  });

  it("serves nothing else from the folder", async () => {
    for (const f of ["notes.txt", "outofbook-offline-1.14.aab", "..%2Fnotes.txt", "play%2Foutofbook-offline-1.14.aab"]) expect((await app.inject({ url: `/releases/${f}` })).statusCode).toBe(404);
  });
});
