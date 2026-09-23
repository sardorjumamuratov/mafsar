import { describe, it, expect, beforeEach } from "vitest";
import { openDB, migrate, all, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";
import { register, signAccessToken } from "../src/auth.js";
import { MAX_PDF_BYTES, extractPdfText, looksLikePdf } from "../src/pdf.js";
import { makePdf } from "./helpers/make-pdf.js";

describe("extractPdfText", () => {
  it("extracts every page's text, in order", async () => {
    const r = await extractPdfText(makePdf([
      "Photosynthesis converts light into chemical energy in plants.",
      "Chlorophyll absorbs mostly blue and red light, reflecting green.",
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pages).toBe(2);
    expect(r.pagesRead).toBe(2);
    expect(r.text.indexOf("Photosynthesis")).toBeGreaterThanOrEqual(0);
    expect(r.text.indexOf("Chlorophyll")).toBeGreaterThan(r.text.indexOf("Photosynthesis"));
  });

  it("recognises PDF bytes", () => {
    expect(looksLikePdf(makePdf(["x"]))).toBe(true);
    expect(looksLikePdf(new TextEncoder().encode("<html></html>"))).toBe(false);
  });

  it("rejects bytes that aren't a PDF", async () => {
    expect(await extractPdfText(new TextEncoder().encode("<html>not a pdf</html>"))).toMatchObject({ ok: false, error: "not_pdf" });
  });

  it("reports a PDF with no selectable text (such as a scan)", async () => {
    expect(await extractPdfText(makePdf([""]))).toMatchObject({ ok: false, error: "no_text" });
  });

  it("reports a broken PDF instead of throwing", async () => {
    const r = await extractPdfText(new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf"));
    expect(r.ok).toBe(false);
  });
});

describe("POST /v1/extract/pdf", () => {
  let db: DB;
  let app: ReturnType<typeof createApp>;
  let token: string;

  beforeEach(async () => {
    db = openDB(":memory:");
    await migrate(db);
    app = createApp(db);
    const user = (await register(db, "pdf@mafsar.dev", "password123"))!;
    token = await signAccessToken(user.id);
  });

  const upload = (body: Uint8Array, headers: Record<string, string> = { authorization: `Bearer ${token}` }) =>
    app.request("/v1/extract/pdf", { method: "POST", headers: { "content-type": "application/pdf", ...headers }, body });

  it("requires a token", async () => {
    expect((await upload(makePdf(["x"]), {})).status).toBe(401);
  });

  it("returns the text and page counts", async () => {
    const res = await upload(makePdf(["Mitochondria produce most of the cell's ATP through respiration."]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toContain("Mitochondria");
    expect(body.pages).toBe(1);
    expect(body.pagesRead).toBe(1);
  });

  it("refuses a non-PDF with a readable message", async () => {
    const res = await upload(new TextEncoder().encode("hello"));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("not_pdf");
    expect(body.message).toBeTruthy();
  });

  it("refuses files over the size limit", async () => {
    const res = await upload(new Uint8Array(MAX_PDF_BYTES + 1));
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("too_large");
  });

  it("spends no generation quota (no model is called)", async () => {
    await upload(makePdf(["Mitochondria produce most of the cell's ATP through respiration."]));
    expect(await all(db, "SELECT id FROM generation_events", [])).toHaveLength(0);
  });

  it("is limited to 10 per minute per user", async () => {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await upload(new TextEncoder().encode("hello"))).status);
    expect(codes.slice(0, 10).every((s) => s === 422)).toBe(true);
    expect(codes[10]).toBe(429);
  });
});
