import { Router } from "express";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/events", async (req, res) => {
  const result = await pool.query(
    "SELECT * FROM calendar_events WHERE user_id = $1 ORDER BY event_date ASC",
    [req.userId]
  );
  res.json({ events: result.rows });
});

router.post("/events", async (req, res) => {
  const { title, details, eventDate, remindBeforeDays } = req.body;
  if (!title?.trim() || !eventDate) {
    return res.status(400).json({ error: "title и eventDate обязательны" });
  }
  const result = await pool.query(
    `INSERT INTO calendar_events (user_id, title, details, event_date, remind_before_days)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.userId, title.trim(), details?.trim() || null, eventDate, remindBeforeDays || 7]
  );
  res.status(201).json({ event: result.rows[0] });
});

router.delete("/events/:id", async (req, res) => {
  const result = await pool.query(
    "DELETE FROM calendar_events WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.userId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Событие не найдено" });
  res.status(204).end();
});

// Сохраняет/обновляет push-подписку конкретного браузера/устройства.
// endpoint — часть самой подписки (выдаёт push-сервис браузера) и служит
// естественным ключом: повторная подписка с того же устройства обновляет
// запись, а не плодит дубликаты.
router.post("/push/subscribe", async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ error: "Некорректная push-подписка" });
  }
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [req.userId, endpoint, keys.p256dh, keys.auth]
  );
  res.status(201).json({ ok: true });
});

router.post("/push/unsubscribe", async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  res.status(204).end();
});

export default router;
