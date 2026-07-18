import { createWorker } from "tesseract.js";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { PDFParse } from "pdf-parse";

// Bare page-marker output from pdf-parse ("-- 1 of 3 --") with nothing else
// means the PDF has no text layer — it's a scan/photo wrapped in a PDF.
const MIN_MEANINGFUL_TEXT_LENGTH = 30;

// Phone photos of paper lab reports are the case OCR actually struggles
// with (KDL's own PDFs already have a text layer and skip OCR entirely —
// see isMeaningfulText below). Below this width Tesseract tends to lose
// thin table borders and small print, so scale up before recognizing.
const OCR_MIN_WIDTH = 2000;

function isMeaningfulText(text) {
  return text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, "").trim().length >= MIN_MEANINGFUL_TEXT_LENGTH;
}

/**
 * Cheap, safe preprocessing pass before handing an image to Tesseract:
 * auto-rotate by EXIF orientation (sideways phone photos are common),
 * grayscale, stretch contrast, sharpen text edges, and upscale small
 * images. Deliberately skips binarization/thresholding — a global
 * black/white cutoff reliably wrecks phone photos with uneven lighting
 * or a shadow across the page, which is worse than leaving it grayscale.
 */
async function preprocessForOcr(buffer) {
  const image = sharp(buffer).rotate();
  const { width } = await image.metadata();
  let pipeline = image.grayscale().normalize().sharpen();
  if (width && width < OCR_MIN_WIDTH) {
    pipeline = pipeline.resize({ width: OCR_MIN_WIDTH, kernel: sharp.kernel.lanczos3 });
  }
  return pipeline.toBuffer();
}

async function ocrImageBuffer(worker, buffer) {
  const processed = await preprocessForOcr(buffer);
  const {
    data: { text },
  } = await worker.recognize(processed);
  return text;
}

/**
 * Renders every page of a scanned/photographed PDF to an image and OCRs
 * each one. Used as a fallback when the PDF has no embedded text layer.
 */
async function ocrScannedPdf(parser) {
  const { pages } = await parser.getScreenshot({ imageBuffer: true, scale: 3 });
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
    return await ocrImageBuffer(worker, fs.readFileSync(filePath));
  } finally {
    await worker.terminate();
  }
}
