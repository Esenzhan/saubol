import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from "recharts";
import { api } from "../api/client.js";
import { useTheme } from "../theme.jsx";
import { groupNamesByCategory } from "../biomarkerCategories.js";

const CHART_COLORS = {
  day: { grid: "#232a2c1a", line: "#276a63", range: "#8a5a1f", flagged: "#9c2b22", tooltipBg: "#f6f5ec", tooltipText: "#232a2c" },
  night: { grid: "#dcece51a", line: "#46e0b4", range: "#f0c04c", flagged: "#ff6b5c", tooltipBg: "#142320", tooltipText: "#dcece5" },
};

const SECTIONS = [
  { key: "diagnosis", label: "Диагнозы" },
  { key: "medication", label: "Лекарства" },
  { key: "recommendation", label: "Рекомендации" },
  { key: "allergy", label: "Аллергии" },
];

const NEGATIVE_RESULT_RE = /^(не обнаружено|отрицательно|нет|отсутству)/i;

function isNegativeResult(text) {
  return NEGATIVE_RESULT_RE.test(text.trim());
}

function ChartDot({ cx, cy, payload, colors }) {
  if (cx == null || cy == null) return null;
  if (!payload.flagged) return <circle cx={cx} cy={cy} r={3} fill={colors.line} />;
  return <circle cx={cx} cy={cy} r={5} fill={colors.flagged} fillOpacity={0.25} stroke={colors.flagged} strokeWidth={2} />;
}

function BiomarkerPicker({ groups, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, names: g.names.filter((n) => n.toLowerCase().includes(q)) }))
      .filter((g) => g.names.length > 0);
  }, [groups, query]);

  function pick(name) {
    onChange(name);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative w-full sm:w-auto" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full sm:w-auto max-w-full text-sm border border-ink/15 rounded-md px-3 py-1.5 bg-surface text-left flex items-center gap-2"
      >
        <span className="truncate">{value || "Выберите показатель"}</span>
        <svg className="w-3 h-3 shrink-0 text-ink/40 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 sm:left-auto sm:w-80 max-w-[90vw] rounded-md border border-ink/15 bg-surface shadow-lg">
          <div className="p-2 border-b border-ink/10">
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск показателя…"
              className="w-full text-base bg-paper border border-ink/15 rounded-md px-2 py-1.5"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filteredGroups.map((g) => (
              <div key={g.label}>
                <p className="px-3 pt-2 pb-1 text-xs uppercase tracking-wide text-ink/40">{g.label}</p>
                {g.names.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => pick(n)}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-paper ${n === value ? "text-moss font-medium" : ""}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ))}
            {filteredGroups.length === 0 && <p className="px-3 py-3 text-sm text-ink/40">Ничего не найдено</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ChartTooltip({ active, payload, colors }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        background: colors.tooltipBg,
        color: colors.tooltipText,
        border: `1px solid ${colors.grid}`,
        borderRadius: 6,
        fontSize: 12,
        padding: "6px 10px",
      }}
    >
      <p>{p.date}</p>
      <p className="font-medium">
        {p.value} {p.unit || ""}
      </p>
      {p.flagged && (
        <p style={{ color: colors.flagged, maxWidth: 200 }}>
          Значение сильно выходит за пределы нормы — возможна ошибка распознавания. Сверьте с оригиналом документа.
        </p>
      )}
    </div>
  );
}

export default function MedCard() {
  const { theme } = useTheme();
  const chartColors = CHART_COLORS[theme];
  const [selectedName, setSelectedName] = useState(null);

  const { data: namesRes } = useSWR("biomarkerNames", () => api.listBiomarkerNames());
  const names = namesRes?.names ?? [];

  useEffect(() => {
    if (!selectedName && names.length > 0) setSelectedName(names[0]);
  }, [names, selectedName]);

  const { data: biomarkersRes } = useSWR(selectedName ? ["biomarkers", selectedName] : null, () =>
    api.listBiomarkers(selectedName)
  );
  const rows = biomarkersRes?.biomarkers ?? [];

  const sectionQueries = SECTIONS.map((s) => useSWR(["medcard", s.key], () => api.listMedcard(s.key)));
  const entries = Object.fromEntries(SECTIONS.map((s, i) => [s.key, sectionQueries[i].data?.entries ?? []]));

  const groups = useMemo(() => groupNamesByCategory(names), [names]);

  const numericRows = useMemo(() => rows.filter((r) => r.value !== null), [rows]);
  const qualitativeRows = useMemo(() => rows.filter((r) => r.value === null && r.value_text), [rows]);

  const series = useMemo(
    () =>
      numericRows.map((b) => ({
        date: b.measured_at ? new Date(b.measured_at).toLocaleDateString("ru-RU") : "—",
        value: Number(b.value),
        unit: b.unit,
        flagged: b.flagged_for_review,
      })),
    [numericRows]
  );

  const qualitativeList = useMemo(
    () =>
      [...qualitativeRows]
        .reverse()
        .map((b) => ({
          date: b.measured_at ? new Date(b.measured_at).toLocaleDateString("ru-RU") : "—",
          text: b.value_text,
          negative: isNegativeResult(b.value_text),
        })),
    [qualitativeRows]
  );

  const unit = rows.find((r) => r.unit)?.unit || "";
  const latestRange = [...rows].reverse().find((r) => r.ref_range_low != null && r.ref_range_high != null);
  const refLow = latestRange ? Number(latestRange.ref_range_low) : null;
  const refHigh = latestRange ? Number(latestRange.ref_range_high) : null;
  const hasRange = refLow != null && refHigh != null;

  // Include the reference range in the Y domain — otherwise a patient's values
  // that are entirely above/below the norm push the norm band off-screen.
  // Domain entries are functions so Recharts still picks its own "nice"
  // rounded tick values around whatever min/max results (a manually padded
  // domain with non-round numbers made Recharts render a garbage bottom tick).
  const yDomain = hasRange
    ? [(dataMin) => Math.min(dataMin, refLow), (dataMax) => Math.max(dataMax, refHigh)]
    : ["auto", "auto"];

  return (
    <div>
      <p className="font-display font-light tracking-tight text-3xl mb-1">Медкарта</p>
      <p className="text-ink/60 mb-8">Динамика показателей и структурированные записи</p>

      <div className="rounded-lg border border-ink/10 bg-surface p-5 mb-10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <p className="font-medium">
            Динамика показателя{unit && <span className="text-ink/50 font-normal"> ({unit})</span>}
          </p>
          {names.length > 0 && (
            <BiomarkerPicker groups={groups} value={selectedName} onChange={setSelectedName} />
          )}
        </div>
        {hasRange && (
          <p className="text-xs text-ink/50 mb-3">
            Норма: {refLow}–{refHigh} {unit}
          </p>
        )}
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={yDomain} />
              <Tooltip content={<ChartTooltip colors={chartColors} />} />
              {hasRange && (
                <ReferenceArea y1={refLow} y2={refHigh} fill={chartColors.range} fillOpacity={0.1} strokeOpacity={0} />
              )}
              {hasRange && (
                <ReferenceLine
                  y={refLow}
                  stroke={chartColors.range}
                  strokeDasharray="4 4"
                  label={{ value: "норма", fontSize: 10, fill: chartColors.range, position: "insideBottomLeft" }}
                />
              )}
              {hasRange && <ReferenceLine y={refHigh} stroke={chartColors.range} strokeDasharray="4 4" />}
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartColors.line}
                strokeWidth={2}
                isAnimationActive={false}
                dot={({ key, ...dotProps }) => <ChartDot key={key} {...dotProps} colors={chartColors} />}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : qualitativeList.length === 0 ? (
          <p className="text-sm text-ink/50">Нет данных для отображения. Загрузите анализы в разделе «Документы».</p>
        ) : null}
        {qualitativeList.length > 0 && (
          <div className={series.length > 0 ? "mt-4 pt-4 border-t border-ink/10" : ""}>
            <ul className="space-y-1.5">
              {qualitativeList.map((item, i) => (
                <li key={i} className="flex items-center justify-between text-sm gap-3">
                  <span className="text-ink/50 shrink-0">{item.date}</span>
                  <span className={`text-right ${item.negative ? "text-ink/70" : "text-danger font-medium"}`}>
                    {item.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {SECTIONS.map((section) => (
        <div key={section.key} className="mb-8">
          <p className="font-medium mb-2">{section.label}</p>
          <div className="space-y-2">
            {(entries[section.key] || []).map((entry) => (
              <div key={entry.id} className="rounded-md border border-ink/10 bg-surface px-4 py-3">
                <p className="text-sm font-medium">{entry.title}</p>
                {entry.details && <p className="text-xs text-ink/50 mt-0.5">{entry.details}</p>}
              </div>
            ))}
            {(entries[section.key] || []).length === 0 && (
              <p className="text-sm text-ink/40">Нет записей</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
