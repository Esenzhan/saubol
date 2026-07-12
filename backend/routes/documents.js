import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { extractTextFromDocument } from "../services/ocr.js";
import { extractBiomarkers } from "../services/ai.js";

const router = Router();

const uploadDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAuth);

// Загрузка документа: сохраняет файл, запускает OCR + извлечение биомаркеров
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не передан" });

  try {
    const docResult = await pool.query(
      `INSERT INTO documents (user_id, original_filename, storage_path, document_type, status)
       VALUES ($1, $2, $3, $4, 'processing') RETURNING *`,
      [req.userId, req.file.originalname, req.file.path, req.body.documentType || "other"]
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
    const biomarkers = await extractBiomarkers(rawText);

    await pool.query(
      "UPDATE documents SET raw_text = $1, status = 'parsed' WHERE id = $2",
      [rawText, documentId]
    );

    for (const b of biomarkers) {
      await pool.query(
        `INSERT INTO biomarkers (user_id, document_id, name, value, unit, ref_range_low, ref_range_high, measured_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          documentId,
          b.name,
          b.value,
          b.unit,
          b.ref_range_low,
          b.ref_range_high,
          b.measured_at,
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
    "SELECT * FROM documents WHERE user_id = $1 ORDER BY created_at DESC",
    [req.userId]
  );
  res.json({ documents: result.rows });
});

router.get("/:id", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM documents WHERE id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Документ не найден" });
  res.json({ document: result.rows[0] });
});

export default router;
