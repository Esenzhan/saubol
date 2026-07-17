import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import documentsRoutes from "./routes/documents.js";
import recordsRoutes from "./routes/records.js";
import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";

dotenv.config();

// Изоляция от крашей воркеров (например, tesseract.js) при обработке одного
// документа не должна ронять сервис для всех остальных пользователей.
process.on("uncaughtException", (err) => {
  console.error("Необработанное исключение:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("Необработанный отказ промиса:", err);
});

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || "*" }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/records", recordsRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
