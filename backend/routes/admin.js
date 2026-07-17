import { Router } from "express";
import pool from "../db/pool.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/users", async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.is_admin, u.created_at,
            COUNT(d.id)::int AS document_count
     FROM users u
     LEFT JOIN documents d ON d.user_id = u.id
     GROUP BY u.id
     ORDER BY u.id`
  );
  res.json({ users: result.rows });
});

export default router;
