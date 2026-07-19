import { Router } from "express";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Динамика конкретного показателя (для графиков). Только подтверждённые —
// свежеизвлечённые ИИ показатели ждут проверки на экране подтверждения и
// не должны попадать в медкарту/чат до этого.
router.get("/biomarkers", async (req, res) => {
  const { name } = req.query;
  const params = [req.userId];
  let query = "SELECT * FROM biomarkers WHERE user_id = $1 AND confirmed = true";
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
    "SELECT DISTINCT name FROM biomarkers WHERE user_id = $1 AND confirmed = true ORDER BY name",
    [req.userId]
  );
  res.json({ names: result.rows.map((r) => r.name) });
});

// Каталог показателей для поиска при ручном добавлении на экране
// подтверждения: имя + единица измерения из самой свежей записи с этим
// именем — чтобы при выборе показателя единица подтягивалась сама.
router.get("/biomarkers/catalog", async (req, res) => {
  const result = await pool.query(
    `SELECT DISTINCT ON (name) name, unit
     FROM biomarkers
     WHERE user_id = $1 AND confirmed = true
     ORDER BY name, measured_at DESC NULLS LAST, created_at DESC`,
    [req.userId]
  );
  res.json({ catalog: result.rows });
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

// Динамика приёма лекарства (для графика). Нет понятия "подтверждено" —
// эти записи не приходят от ИИ, только от самого пользователя.
router.get("/medications", async (req, res) => {
  const { name } = req.query;
  const params = [req.userId];
  let query = "SELECT * FROM medication_doses WHERE user_id = $1";
  if (name) {
    params.push(name);
    query += " AND name = $2";
  }
  query += " ORDER BY taken_at ASC";
  const result = await pool.query(query, params);
  res.json({ doses: result.rows });
});

// Список лекарств, которые пользователь когда-либо принимал
router.get("/medications/names", async (req, res) => {
  const result = await pool.query(
    "SELECT DISTINCT name FROM medication_doses WHERE user_id = $1 ORDER BY name",
    [req.userId]
  );
  res.json({ names: result.rows.map((r) => r.name) });
});

// Каталог для автоподстановки единицы измерения при вводе новой дозы —
// та же идея, что и biomarkers/catalog выше.
router.get("/medications/catalog", async (req, res) => {
  const result = await pool.query(
    `SELECT DISTINCT ON (name) name, dose_unit
     FROM medication_doses
     WHERE user_id = $1
     ORDER BY name, taken_at DESC, created_at DESC`,
    [req.userId]
  );
  res.json({ catalog: result.rows });
});

router.post("/medications", async (req, res) => {
  const { name, doseValue, doseUnit, takenAt } = req.body;
  if (!name?.trim() || doseValue === undefined || doseValue === null || doseValue === "" || !takenAt) {
    return res.status(400).json({ error: "name, doseValue и takenAt обязательны" });
  }
  const result = await pool.query(
    `INSERT INTO medication_doses (user_id, name, dose_value, dose_unit, taken_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.userId, name.trim(), doseValue, doseUnit?.trim() || null, takenAt]
  );
  res.status(201).json({ dose: result.rows[0] });
});

router.delete("/medications/:id", async (req, res) => {
  const result = await pool.query(
    "DELETE FROM medication_doses WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Запись не найдена" });
  res.status(204).end();
});

export default router;
