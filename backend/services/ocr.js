import { createWorker } from "tesseract.js";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

/**
 * Tesseract (leptonica) can't read PDF streams directly — passing it a PDF
 * crashes the whole Node process via an uncaught worker "error" event
 * instead of rejecting the recognize() promise, so PDFs must be branched
 * off before we ever call worker.recognize().
 */
export async function extractTextFromDocument(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const { text } = await parser.getText();
      return text;
    } finally {
      await parser.destroy();
    }
  }

  const worker = await createWorker("rus+eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(filePath);
    return text;
  } finally {
    await worker.terminate();
  }
}
