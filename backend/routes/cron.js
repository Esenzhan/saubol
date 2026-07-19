import { Router } from "express";
import webpush from "web-push";
import pool from "../db/pool.js";

const router = Router();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:saubol@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// event_date приходит из pg как чистая строка "YYYY-MM-DD" (см. кастомный
// парсер DATE в db/pool.js) — сравнивать её с "сегодня" через new Date(str)
// рискует уехать на день из-за локальной таймзоны. Строим оба конца из
// UTC-полночи по календарным полям, тогда разница в днях считается точно.
function toUTCDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function pluralDays(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня";
  return "дней";
}

function daysLabel(n) {
  if (n <= 0) return "сегодня";
  if (n === 1) return "завтра";
  return `через ${n} ${pluralDays(n)}`;
}

// Дёргается раз в день внешним cron'ом (GitHub Actions, см.
// .github/workflows/calendar-reminders.yml) — бесплатный план Render
// засыпает без входящих запросов, поэтому напоминание не может жить на
// setInterval внутри самого процесса: сервис вполне может быть уснувшим
// именно в нужный момент. Условие ниже — не "ровно N дней до события", а
// "окно напоминания уже наступило (и событие не в прошлом)" — так один
// пропущенный день (сервис не ответил на пинг) не хоронит напоминание
// навсегда, оно уйдёт при следующем успешном запуске.
router.post("/check-reminders", async (req, res) => {
  if (!process.env.CRON_SECRET || req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const due = await pool.query(
    `SELECT * FROM calendar_events
     WHERE notified_at IS NULL
       AND event_date >= CURRENT_DATE
       AND event_date <= CURRENT_DATE + remind_before_days`
  );

  const today = toUTCDate(new Date().toISOString().slice(0, 10));
  let sent = 0;
  let failed = 0;

  for (const event of due.rows) {
    const daysLeft = Math.round((toUTCDate(event.event_date) - today) / 86400000);
    const payload = JSON.stringify({
      title: "SauBol — напоминание",
      body: `${event.title}: ${daysLabel(daysLeft)}`,
      url: "/calendar",
    });

    const subs = await pool.query("SELECT * FROM push_subscriptions WHERE user_id = $1", [event.user_id]);
    for (const sub of subs.rows) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        // 404/410 — подписка отозвана самим браузером (юзер снял разрешение,
        // переустановил сайт и т.п.), сервис push никогда не примет её снова.
        if (err.statusCode === 404 || err.statusCode === 410) {
          await pool.query("DELETE FROM push_subscriptions WHERE id = $1", [sub.id]);
        } else {
          console.error("push send failed:", err);
        }
      }
    }

    await pool.query("UPDATE calendar_events SET notified_at = now() WHERE id = $1", [event.id]);
  }

  res.json({ checked: due.rows.length, sent, failed });
});

export default router;
