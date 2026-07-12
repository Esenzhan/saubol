import { createWorker } from "tesseract.js";

/**
 * Распознаёт текст из изображения/скана документа.
 * Для продакшена на объёмных PDF-выписках стоит рассмотреть
 * облачный OCR (Google Vision, Yandex Vision, AWS Textract) —
 * они точнее на бланках лабораторий. Tesseract — рабочий старт для MVP.
 */
export async function extractTextFromImage(filePath) {
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
