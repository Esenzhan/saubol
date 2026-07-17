import { useEffect, useMemo, useState } from "react";
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

function ChartDot({ cx, cy, payload, colors }) {
  if (cx == null || cy == null) return null;
  if (!payload.flagged) return <circle cx={cx} cy={cy} r={3} fill={colors.line} />;
  return <circle cx={cx} cy={cy} r={5} fill={colors.flagged} fillOpacity={0.25} stroke={colors.flagged} strokeWidth={2} />;
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
  const [names, setNames] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [rows, setRows] = useState([]);
  const [entries, setEntries] = useState({});

  useEffect(() => {
    api.listBiomarkerNames().then((res) => {
      setNames(res.names);
      if (res.names.length > 0) setSelectedName(res.names[0]);
    });
    Promise.all(SECTIONS.map((s) => api.listMedcard(s.key))).then((results) => {
      const map = {};
      SECTIONS.forEach((s, i) => (map[s.key] = results[i].entries));
      setEntries(map);
    });
  }, []);

  useEffect(() => {
    if (!selectedName) return;
    api.listBiomarkers(selectedName).then((res) => setRows(res.biomarkers));
  }, [selectedName]);

  const groups = useMemo(() => groupNamesByCategory(names), [names]);

  const series = useMemo(
    () =>
      rows.map((b) => ({
        date: b.measured_at ? new Date(b.measured_at).toLocaleDateString("ru-RU") : "—",
        value: Number(b.value),
        unit: b.unit,
        flagged: b.flagged_for_review,
      })),
    [rows]
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
        <div className="flex items-center justify-between mb-1">
          <p className="font-medium">
            Динамика показателя{unit && <span className="text-ink/50 font-normal"> ({unit})</span>}
          </p>
          {names.length > 0 && (
            <select
              value={selectedName || ""}
              onChange={(e) => setSelectedName(e.target.value)}
              className="text-sm border border-ink/15 rounded-md px-2 py-1 bg-surface"
            >
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
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
        ) : (
          <p className="text-sm text-ink/50">Нет данных для отображения. Загрузите анализы в разделе «Документы».</p>
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
