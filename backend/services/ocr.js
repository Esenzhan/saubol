import { createWorker } from "tesseract.js";
import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

// Bare page-marker output from pdf-parse ("-- 1 of 3 --") with nothing else
// means the PDF has no text layer — it's a scan/photo wrapped in a PDF.
const MIN_MEANINGFUL_TEXT_LENGTH = 30;

function isMeaningfulText(text) {
  return text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim().length >= MIN_MEANINGFUL_TEXT_LENGTH;
}

async function ocrImageBuffer(worker, buffer) {
  const {
    data: { text },
  } = await worker.recognize(buffer);
  return text;
}

/**
 * Renders every page of a scanned/photographed PDF to an image and OCRs
 * each one. Used as a fallback when the PDF has no embedded text layer.
 */
async function ocrScannedPdf(parser) {
  const { pages } = await parser.getScreenshot({ imageBuffer: true, scale: 2 });
  const worker = await createWorker("rus+eng");
  try {
    const pageTexts = [];
    for (const page of pages) {
      pageTexts.push(await ocrImageBuffer(worker, Buffer.from(page.data)));
    }
    return pageTexts.join("\n\n");
  } finally {
    await worker.terminate();
  }
}

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
      if (isMeaningfulText(text)) return text;
      return await ocrScannedPdf(parser);
    } finally {
      await parser.destroy();
    }
  }

  const worker = await createWorker("rus+eng");
  try {
    return await ocrImageBuffer(worker, filePath);
  } finally {
    await worker.terminate();
  }
}
