import { useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "../api/client.js";
import { pushSupported, enablePush, disablePush, getExistingSubscription } from "../push.js";

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

// event_date приходит из pg как чистая строка "YYYY-MM-DD" — форматируем
// её напрямую, без new Date(), которая переинтерпретирует дату в местной
// таймзоне зрителя и может сдвинуть день (см. тот же приём в
// documentDisplay.js для document_date).
function formatIsoDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Понедельник — первый день недели; JS Date.getDay() отдаёт 0=воскресенье,
// сдвигаем на разницу, чтобы 0 соответствовал понедельнику.
function mondayIndex(year, month, day) {
  return (new Date(year, month, day).getDay() + 6) % 7;
}

function PushBanner() {
  const { data: sub, mutate } = useSWR("pushSubscription", getExistingSubscription);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!pushSupported()) {
    if (isIOS && !isStandalone) {
      return (
        <div className="rounded-lg border border-amber/30 bg-amber/10 p-4 mb-5 text-sm text-amber">
          Чтобы получать напоминания на iPhone, добавьте сайт на экран «Домой»
          (кнопка «Поделиться» → «На экран Домой») и откройте его оттуда — в
          обычной вкладке Safari push-уведомления недоступны.
        </div>
      );
    }
    return null;
  }

  async function handleToggle() {
    setBusy(true);
    setError("");
    try {
      if (sub) await disablePush();
      else await enablePush();
      await mutate();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-surface p-4 mb-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Push-уведомления</p>
          <p className="text-xs text-ink/50 mt-0.5">
            {sub ? "Включены на этом устройстве" : "Напомним за неделю до события на этом устройстве"}
          </p>
        </div>
        <button
          type="button"
          onClick={handleToggle}
          disabled={busy}
          className={`shrink-0 text-xs rounded-md px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${
            sub ? "border border-ink/15 text-ink/60 hover:text-ink" : "bg-moss text-onaccent hover:bg-moss/90"
          }`}
        >
          {busy ? "…" : sub ? "выключить" : "включить"}
        </button>
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  );
}

function AddEventForm({ defaultDate, onAdd, onCancel }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [eventDate, setEventDate] = useState(defaultDate);
  const [remindBeforeDays, setRemindBeforeDays] = useState(7);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim() || !eventDate) return;
    setSaving(true);
    setError("");
    try {
      await onAdd({ title: title.trim(), details: details.trim(), eventDate, remindBeforeDays: Number(remindBeforeDays) || 7 });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-ink/10 bg-paper p-3 mb-4">
      <div className="flex flex-wrap gap-2">
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название события"
          className="flex-1 min-w-[10rem] text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5"
        />
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5"
        />
      </div>
      <input
        type="text"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        placeholder="Детали (необязательно)"
        className="w-full mt-2 text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5"
      />
      <label className="flex items-center gap-2 mt-2 text-xs text-ink/60">
        Напомнить за
        <input
          type="number"
          min="0"
          value={remindBeforeDays}
          onChange={(e) => setRemindBeforeDays(e.target.value)}
          className="w-14 text-sm bg-surface border border-ink/15 rounded-md px-2 py-1"
        />
        дней
      </label>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <div className="flex items-center gap-3 mt-3">
        <button type="submit" disabled={saving} className="text-xs bg-moss text-onaccent rounded-md px-3 py-1.5 font-medium disabled:opacity-50">
          {saving ? "сохраняем…" : "добавить"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-ink/50 hover:text-ink">
          закрыть
        </button>
      </div>
    </form>
  );
}

export default function Calendar() {
  const { data, mutate } = useSWR("calendarEvents", () => api.listCalendarEvents());
  const events = data?.events ?? [];

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");

  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const list = map.get(e.event_date) || [];
      list.push(e);
      map.set(e.event_date, list);
    }
    return map;
  }, [events]);

  const grid = useMemo(() => {
    const leading = mondayIndex(cursor.year, cursor.month, 1);
    const total = daysInMonth(cursor.year, cursor.month);
    const cells = Array.from({ length: leading }, () => null);
    for (let day = 1; day <= total; day++) {
      const iso = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, iso });
    }
    return cells;
  }, [cursor]);

  const visibleEvents = useMemo(() => {
    const list = selectedDate ? events.filter((e) => e.event_date === selectedDate) : events;
    return [...list].sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [events, selectedDate]);

  function changeMonth(delta) {
    setCursor((c) => {
      const m = c.month + delta;
      const year = c.year + Math.floor(m / 12);
      const month = ((m % 12) + 12) % 12;
      return { year, month };
    });
  }

  async function handleAdd(body) {
    await api.addCalendarEvent(body);
    setShowAdd(false);
    await mutate();
  }

  async function handleDelete(id) {
    try {
      await api.deleteCalendarEvent(id);
      await mutate();
    } catch (err) {
      setError(err.message);
    }
  }

  const today = todayIso();

  return (
    <div>
      <p className="font-display font-light tracking-tight text-3xl mb-1">Календарь</p>
      <p className="text-ink/60 mb-6">Приёмы, анализы и другие даты, о которых напомнить заранее</p>

      <PushBanner />

      <div className="rounded-lg border border-ink/10 bg-surface p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => changeMonth(-1)} className="text-ink/50 hover:text-ink p-1">
            ←
          </button>
          <p className="font-medium">{MONTH_NAMES[cursor.month]} {cursor.year}</p>
          <button type="button" onClick={() => changeMonth(1)} className="text-ink/50 hover:text-ink p-1">
            →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink/40 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((cell, i) => {
            if (!cell) return <div key={i} />;
            const hasEvents = eventsByDate.has(cell.iso);
            const isToday = cell.iso === today;
            const isSelected = cell.iso === selectedDate;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedDate((d) => (d === cell.iso ? null : cell.iso))}
                className={`aspect-square rounded-md text-sm flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isSelected ? "bg-moss text-onaccent" : isToday ? "bg-moss/10 text-moss font-medium" : "hover:bg-paper"
                }`}
              >
                <span>{cell.day}</span>
                {hasEvents && <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-onaccent" : "bg-moss"}`} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-medium">
          {selectedDate ? `События ${formatIsoDate(selectedDate)}` : "Все события"}
          {selectedDate && (
            <button type="button" onClick={() => setSelectedDate(null)} className="ml-2 text-xs text-moss hover:text-moss/80">
              показать все
            </button>
          )}
        </p>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="text-xs text-moss border border-moss/40 rounded-full px-3 py-1.5 hover:border-moss/70 transition-colors shrink-0"
          >
            + добавить событие
          </button>
        )}
      </div>

      {showAdd && <AddEventForm defaultDate={selectedDate || today} onAdd={handleAdd} onCancel={() => setShowAdd(false)} />}

      {error && <p className="text-sm text-danger mb-3">{error}</p>}

      {visibleEvents.length === 0 ? (
        <p className="text-sm text-ink/50">
          {selectedDate ? "На эту дату событий нет." : "Событий пока нет — добавьте первое."}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleEvents.map((e) => (
            <div key={e.id} className="rounded-md border border-ink/10 bg-surface px-4 py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{e.title}</p>
                <p className="text-xs text-ink/40 mt-0.5">
                  {formatIsoDate(e.event_date)} · напомнить за {e.remind_before_days} дн.
                </p>
                {e.details && <p className="text-xs text-ink/60 mt-1">{e.details}</p>}
              </div>
              <button type="button" onClick={() => handleDelete(e.id)} className="shrink-0 text-xs text-danger/60 hover:text-danger">
                удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
