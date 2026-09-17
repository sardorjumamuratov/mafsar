import { expect, test } from "vitest";
import { compareVersions } from "../src/version";
import { createApp } from "../src/app";
import { createClient } from "@libsql/client";

test("compareVersions", () => {
  expect(compareVersions("0.3.0", "0.4.0")).toBe(-1);
  expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
  expect(compareVersions("1.0", "1.0.0")).toBe(0);
});

test("middleware rules", async () => {
  const db = createClient({ url: "file::memory:" });
  const app = createApp(db as any);
  const req = (url: string, version?: string, method = "GET") => {
    const headers = new Headers();
    if (version) headers.set("x-mafsar-version", version);
    return app.request(url, { method, headers });
  };
  
  process.env.MIN_CLIENT_VERSION = "0.4.0";
  
  const h1 = await req("/v1/me", "0.3.0");
  expect(h1.status).toBe(426);
  
  const h2 = await req("/v1/me", "0.4.0");
  expect(h2.status).not.toBe(426);
  
  const h3 = await req("/v1/me");
  expect(h3.status).not.toBe(426);
  
  const h4 = await req("/v1/webhooks/stripe", "0.3.0", "POST");
  expect(h4.status).not.toBe(426);
  
  delete process.env.MIN_CLIENT_VERSION;
  const h5 = await req("/v1/me", "0.3.0");
  expect(h5.status).not.toBe(426);
});
