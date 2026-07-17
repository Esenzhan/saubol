import jwt from "jsonwebtoken";
import pool from "../db/pool.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Нет токена авторизации" });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch {
    return res.status(401).json({ error: "Недействительный или истёкший токен" });
  }
}

export async function requireAdmin(req, res, next) {
  const result = await pool.query("SELECT is_admin FROM users WHERE id = $1", [req.userId]);
  if (!result.rows[0]?.is_admin) {
    return res.status(403).json({ error: "Доступ только для администратора" });
  }
  next();
}
