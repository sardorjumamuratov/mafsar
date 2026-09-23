import { extractText, getDocumentProxy } from "unpdf";

// Text extraction for captured PDFs. The file is processed in memory and never
// stored; only the text the user turns into a study set is kept (by the normal
// generate flow).

export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_PAGES = 300;

export type PdfResult =
  | { ok: true; text: string; pages: number; pagesRead: number }
  | { ok: false; error: "not_pdf" | "encrypted" | "no_text" | "unreadable"; message: string };

export function looksLikePdf(bytes: Uint8Array): boolean {
  return Buffer.from(bytes.subarray(0, 1024)).toString("latin1").includes("%PDF-");
}

export async function extractPdfText(bytes: Uint8Array): Promise<PdfResult> {
  if (!looksLikePdf(bytes)) return { ok: false, error: "not_pdf", message: "That file isn't a PDF." };
  try {
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pagesRead = Math.min(totalPages, MAX_PDF_PAGES);
    const joined = (text as string[])
      .slice(0, pagesRead)
      .map((page) => page.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n\n");
    if (joined.replace(/\s/g, "").length < 50) {
      return { ok: false, error: "no_text", message: "This PDF has no selectable text. It may be a scan." };
    }
    return { ok: true, text: joined, pages: totalPages, pagesRead };
  } catch (e: any) {
    if (e?.name === "PasswordException") {
      return { ok: false, error: "encrypted", message: "This PDF is password-protected." };
    }
    return { ok: false, error: "unreadable", message: "Couldn't read this PDF." };
  }
}