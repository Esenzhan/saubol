import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
  await pool.query(sql);
  console.log("Миграция выполнена успешно.");
  await pool.end();
}

migrate().catch((err) => {
  console.error("Ошибка миграции:", err);
  process.exit(1);
});
