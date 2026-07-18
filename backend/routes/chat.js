import { Router } from "express";
import pool from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { chatWithContext } from "../services/ai.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const result = await pool.query(
    "SELECT role, content, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at ASC",
    [req.userId]
  );
  res.json({ messages: result.rows });
});

router.post("/", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: "message обязателен" });

  try {
    const [biomarkersRes, medcardRes, historyRes] = await Promise.all([
      pool.query("SELECT name, value, unit, measured_at FROM biomarkers WHERE user_id = $1 AND confirmed = true", [
        req.userId,
      ]),
      pool.query("SELECT section, title, details, entry_date FROM medcard_entries WHERE user_id = $1", [req.userId]),
      pool.query(
        "SELECT role, content FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20",
        [req.userId]
      ),
    ]);

    const history = historyRes.rows.reverse().map((m) => ({ role: m.role, content: m.content }));

    const answer = await chatWithContext({
      question: message,
      biomarkers: biomarkersRes.rows,
      medcardEntries: medcardRes.rows,
      history,
    });

    await pool.query(
      "INSERT INTO chat_messages (user_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)",
      [req.userId, message, answer]
    );

    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось получить ответ ассистента" });
  }
});

export default router;
