import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { extractTextFromDocument } from "../services/ocr.js";
import { analyzeDocument } from "../services/ai.js";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// Столбцы без file_data — это BYTEA с самим содержимым файла, его незачем
// (и накладно) гонять туда-обратно при каждом списке/детали документа.
// Отдаётся только через GET /:id/file.
const DOC_COLUMNS =
  "id, user_id, original_filename, storage_path, document_type, status, raw_text, document_date, display_name, folder, mime_type, created_at";

const MIME_TYPES = { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

function mimeTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    // busboy/multer decode multipart filenames as latin1 by default (RFC 7578
    // doesn't mandate UTF-8), so non-ASCII names arrive mojibake'd — that
    // then bloats to an invalid on-disk filename (ENAMETOOLONG) once it hits
    // this callback. Fix the encoding, and store on disk under a random name
    // decoupled from any user-controlled string entirely.
    file.originalname = Buffer.from(file.originalname, "latin1").toString("utf8");
    cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAuth);

// Загрузка документа: сохраняет файл (и в БД, диск Render не постоянный),
// запускает OCR + классификацию + извлечение биомаркеров
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не передан" });

  try {
    const fileBytes = fs.readFileSync(req.file.path);
    const docResult = await pool.query(
      `INSERT INTO documents (user_id, original_filename, storage_path, document_type, status, file_data, mime_type)
       VALUES ($1, $2, $3, $4, 'processing', $5, $6) RETURNING ${DOC_COLUMNS}`,
      [req.userId, req.file.originalname, req.file.path, req.body.documentType || "other", fileBytes, mimeTypeFor(req.file.path)]
    );
    const document = docResult.rows[0];

    // Обработка запускается асинхронно, чтобы не блокировать ответ
    processDocument(document.id, req.file.path, req.userId).catch((err) =>
      console.error("Ошибка обработки документа:", err)
    );

    res.status(202).json({ document });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось загрузить документ" });
  }
});

async function processDocument(documentId, filePath, userId) {
  try {
    const rawText = await extractTextFromDocument(filePath);
    const { displayName, folder, biomarkers } = await analyzeDocument(rawText);

    await pool.query(
      "UPDATE documents SET raw_text = $1, status = 'parsed', display_name = $2, folder = $3 WHERE id = $4",
      [rawText, displayName, folder, documentId]
    );

    for (const b of biomarkers) {
      await pool.query(
        `INSERT INTO biomarkers (user_id, document_id, name, value, value_text, unit, ref_range_low, ref_range_high, measured_at, flagged_for_review)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          userId,
          documentId,
          b.name,
          b.value,
          b.value_text,
          b.unit,
          b.ref_range_low,
          b.ref_range_high,
          b.measured_at,
          b.flagged_for_review,
        ]
      );
    }
  } catch (err) {
    await pool.query("UPDATE documents SET status = 'failed' WHERE id = $1", [documentId]);
    throw err;
  }
}

router.get("/", async (req, res) => {
  const result = await pool.query(
    `SELECT ${DOC_COLUMNS} FROM documents WHERE user_id = $1 ORDER BY created_at DESC`,
    [req.userId]
  );
  res.json({ documents: result.rows });
});

router.get("/:id", async (req, res) => {
  const result = await pool.query(
    `SELECT ${DOC_COLUMNS} FROM documents WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Документ не найден" });

  const biomarkers = await pool.query(
    "SELECT * FROM biomarkers WHERE document_id = $1 ORDER BY name",
    [req.params.id]
  );

  res.json({ document: result.rows[0], biomarkers: biomarkers.rows });
});

// Оригинал файла — PDF/PNG/JPG ровно в том виде, в каком он был загружен.
router.get("/:id/file", async (req, res) => {
  const result = await pool.query(
    "SELECT original_filename, mime_type, file_data FROM documents WHERE id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Документ не найден" });
  const doc = result.rows[0];
  if (!doc.file_data) return res.status(404).json({ error: "Файл не сохранён" });

  res.setHeader("Content-Type", doc.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.original_filename)}"`);
  res.send(doc.file_data);
});

export default router;
