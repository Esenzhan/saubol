import { Router } from "express";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Динамика конкретного показателя (для графиков)
router.get("/biomarkers", async (req, res) => {
  const { name } = req.query;
  const params = [req.userId];
  let query = "SELECT * FROM biomarkers WHERE user_id = $1";
  if (name) {
    params.push(name);
    query += " AND name = $2";
  }
  query += " ORDER BY measured_at ASC NULLS LAST";
  const result = await pool.query(query, params);
  res.json({ biomarkers: result.rows });
});

// Список уникальных показателей, которые есть у пользователя
router.get("/biomarkers/names", async (req, res) => {
  const result = await pool.query(
    "SELECT DISTINCT name FROM biomarkers WHERE user_id = $1 ORDER BY name",
    [req.userId]
  );
  res.json({ names: result.rows.map((r) => r.name) });
});

// Разделы медкарты (диагнозы, лекарства, рекомендации, аллергии)
router.get("/medcard", async (req, res) => {
  const { section } = req.query;
  const params = [req.userId];
  let query = "SELECT * FROM medcard_entries WHERE user_id = $1";
  if (section) {
    params.push(section);
    query += " AND section = $2";
  }
  query += " ORDER BY entry_date DESC NULLS LAST";
  const result = await pool.query(query, params);
  res.json({ entries: result.rows });
});

router.post("/medcard", async (req, res) => {
  const { section, title, details, entryDate, documentId } = req.body;
  if (!section || !title) {
    return res.status(400).json({ error: "section и title обязательны" });
  }
  const result = await pool.query(
    `INSERT INTO medcard_entries (user_id, document_id, section, title, details, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.userId, documentId || null, section, title, details || null, entryDate || null]
  );
  res.status(201).json({ entry: result.rows[0] });
});

export default router;
