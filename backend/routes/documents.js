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

// Верхнеуровневые папки страницы «Документы» — держите в синхроне с
// FOLDER_TREE в frontend/src/documentFolders.js. Только «Анализы» сканируется
// ИИ на биомаркеры; остальные три — OCR для будущего чата, без извлечения
// показателей, папка проставляется сразу тем, что выбрал пользователь.
const TOP_FOLDERS = ["Анализы", "Приёмы врачей", "Выписки и заключения", "Другое"];

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

// Загрузка документа: сохраняет файл (и в БД, диск Render не постоянный).
// Папку выбирает пользователь при загрузке (кнопка «+» внутри конкретной
// папки на фронтенде). Только «Анализы» дальше сканируется ИИ на
// биомаркеры; остальные папки получают только OCR-текст (для будущего
// ИИ-чата) — без извлечения показателей.
router.post("/", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Файл не передан" });
  const folder = req.body.folder;
  if (!TOP_FOLDERS.includes(folder)) {
    return res.status(400).json({ error: "Не указана или неизвестна папка документа" });
  }

  try {
    const fileBytes = fs.readFileSync(req.file.path);
    const isAnalysis = folder === "Анализы";
    const docResult = await pool.query(
      `INSERT INTO documents (user_id, original_filename, storage_path, document_type, status, file_data, mime_type, folder)
       VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7) RETURNING ${DOC_COLUMNS}`,
      [
        req.userId,
        req.file.originalname,
        req.file.path,
        req.body.documentType || "other",
        fileBytes,
        mimeTypeFor(req.file.path),
        // «Анализы» ещё предстоит уточнить до конкретной подпапки (ОАК,
        // Биохимия, ...) — folder проставится по итогам анализа. Остальные
        // папки уже точны, показываем документ в нужном месте сразу.
        isAnalysis ? null : folder,
      ]
    );
    const document = docResult.rows[0];

    // Обработка запускается асинхронно, чтобы не блокировать ответ
    const processor = isAnalysis ? processAnalysisDocument : processOtherDocument;
    processor(document.id, req.file.path, req.userId).catch((err) =>
      console.error("Ошибка обработки документа:", err)
    );

    res.status(202).json({ document });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось загрузить документ" });
  }
});

// «Анализы»: OCR + классификация по подпапке + извлечение биомаркеров
// (не подтверждённых — ждут проверки человеком на экране подтверждения).
async function processAnalysisDocument(documentId, filePath, userId) {
  try {
    const rawText = await extractTextFromDocument(filePath);
    const { displayName, folder, documentDate, biomarkers } = await analyzeDocument(rawText);

    await pool.query(
      "UPDATE documents SET raw_text = $1, status = 'parsed', display_name = $2, folder = $3, document_date = $4 WHERE id = $5",
      [rawText, displayName, folder, documentDate, documentId]
    );

    for (const b of biomarkers) {
      await pool.query(
        `INSERT INTO biomarkers (user_id, document_id, name, value, value_text, unit, ref_range_low, ref_range_high, measured_at, flagged_for_review, confirmed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
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
          b.confirmed,
        ]
      );
    }
  } catch (err) {
    await pool.query("UPDATE documents SET status = 'failed' WHERE id = $1", [documentId]);
    throw err;
  }
}

// Остальные папки: только OCR-текст, для будущего ИИ-чата — без вызова
// модели на классификацию/биомаркеры, ничего не попадает в медкарту.
async function processOtherDocument(documentId, filePath) {
  try {
    const rawText = await extractTextFromDocument(filePath);
    await pool.query("UPDATE documents SET raw_text = $1, status = 'parsed' WHERE id = $2", [rawText, documentId]);
  } catch (err) {
    await pool.query("UPDATE documents SET status = 'failed' WHERE id = $1", [documentId]);
    throw err;
  }
}

router.get("/", async (req, res) => {
  // Newest document date first — falls back to upload time for documents
  // that don't have a parsed date yet (still processing, or classification
  // failed), so nothing drops out of the list while it's pending.
  // pending_review flags documents with biomarkers still awaiting
  // confirmation, so the Документы list can show a review badge without an
  // extra request per document.
  const result = await pool.query(
    `SELECT ${DOC_COLUMNS},
       EXISTS(SELECT 1 FROM biomarkers b WHERE b.document_id = documents.id AND b.confirmed = false) AS pending_review
     FROM documents WHERE user_id = $1 ORDER BY COALESCE(document_date, created_at::date) DESC, created_at DESC`,
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

// Экран подтверждения показателей: правит уже извлечённые ИИ биомаркеры
// (значение/единица) и добавляет те, что ИИ не распознал — оба вида разом
// помечаются confirmed = true и перестают быть "на проверке".
router.post("/:id/review", async (req, res) => {
  const { updates, additions } = req.body;
  const documentId = req.params.id;

  const docCheck = await pool.query("SELECT id FROM documents WHERE id = $1 AND user_id = $2", [
    documentId,
    req.userId,
  ]);
  if (docCheck.rows.length === 0) return res.status(404).json({ error: "Документ не найден" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const u of updates || []) {
      await client.query(
        `UPDATE biomarkers SET value = $1, value_text = $2, unit = $3, confirmed = true, flagged_for_review = false
         WHERE id = $4 AND document_id = $5 AND user_id = $6`,
        [u.value ?? null, u.value === null || u.value === undefined ? u.value_text ?? null : null, u.unit ?? null, u.id, documentId, req.userId]
      );
    }

    for (const a of additions || []) {
      if (!a.name || !a.name.trim()) continue;
      await client.query(
        `INSERT INTO biomarkers (user_id, document_id, name, value, value_text, unit, ref_range_low, ref_range_high, measured_at, flagged_for_review, confirmed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, true)`,
        [
          req.userId,
          documentId,
          a.name.trim(),
          a.value ?? null,
          a.value === null || a.value === undefined ? a.value_text ?? null : null,
          a.unit ?? null,
          a.ref_range_low ?? null,
          a.ref_range_high ?? null,
          a.measured_at ?? null,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    return res.status(500).json({ error: "Не удалось сохранить показатели" });
  } finally {
    client.release();
  }

  const biomarkers = await pool.query("SELECT * FROM biomarkers WHERE document_id = $1 ORDER BY name", [documentId]);
  res.json({ biomarkers: biomarkers.rows });
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
