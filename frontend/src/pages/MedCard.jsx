import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ReferenceArea, ResponsiveContainer } from "recharts";
import { api } from "../api/client.js";
import { useTheme } from "../theme.jsx";
import { groupNamesByCategory } from "../biomarkerCategories.js";

// `dose` is a distinct hue from `range` (amber, already used for the norm
// band/lines on the same chart) so an overlaid medication line never reads
// as "this is the reference range" at a glance.
const CHART_COLORS = {
  day: { grid: "#232a2c1a", line: "#276a63", range: "#8a5a1f", flagged: "#9c2b22", dose: "#4a5fc1", tooltipBg: "#f6f5ec", tooltipText: "#232a2c" },
  night: { grid: "#dcece51a", line: "#46e0b4", range: "#f0c04c", flagged: "#ff6b5c", dose: "#8fa6ff", tooltipBg: "#142320", tooltipText: "#dcece5" },
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
  if (payload.flagged)
    return <circle cx={cx} cy={cy} r={5} fill={colors.flagged} fillOpacity={0.25} stroke={colors.flagged} strokeWidth={2} />;
  // Значение вне нормы — сплошная danger-точка: «что не в порядке» должно
  // читаться с графика мгновенно, без сверки с пунктиром нормы.
  if (payload.outOfRange) return <circle cx={cx} cy={cy} r={4} fill={colors.flagged} />;
  return <circle cx={cx} cy={cy} r={3} fill={colors.line} />;
}

function BiomarkerPicker({ groups, value, onChange, allowClear, clearLabel = "Не показывать", placeholder = "Выберите показатель" }) {
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
        <span className="truncate">{value || (allowClear ? clearLabel : placeholder)}</span>
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
            {allowClear && (
              <button
                type="button"
                onClick={() => pick(null)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-paper border-b border-ink/5 ${value == null ? "text-moss font-medium" : "text-ink/50"}`}
              >
                {clearLabel}
              </button>
            )}
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

// `withLabels` is only true once a second line (the overlaid medication
// dose) is actually on the chart — otherwise this renders exactly as before
// (bare value + unit, no series name prefix), so the common single-series
// case is unaffected.
function ChartTooltip({ active, payload, colors, withLabels }) {
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
      {payload.map((entry) => {
        if (entry.value == null) return null;
        const unitLabel = entry.dataKey === "dose" ? p.doseUnit : p.unit;
        return (
          <p key={entry.dataKey} className="font-medium" style={{ color: entry.color }}>
            {withLabels && entry.name ? `${entry.name}: ` : ""}
            {entry.value} {unitLabel || ""}
          </p>
        );
      })}
      {p.flagged && (
        <p style={{ color: colors.flagged, maxWidth: 200 }}>
          Значение сильно выходит за пределы нормы — возможна ошибка распознавания. Сверьте с оригиналом документа.
        </p>
      )}
    </div>
  );
}

// No AI/OCR pipeline extracts medication doses from documents — every entry
// here is typed in by hand, so this form (not a review screen) is the only
// way new points ever reach the chart. `names` feeds a native <datalist>
// for reusing an existing medication name instead of retyping it, and
// picking one auto-fills its last-used dose unit from `catalog`.
function AddDoseForm({ names, catalog, onAdd, onCancel }) {
  const [name, setName] = useState("");
  const [doseValue, setDoseValue] = useState("");
  const [doseUnit, setDoseUnit] = useState("");
  const [takenAt, setTakenAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleNameChange(value) {
    setName(value);
    if (!doseUnit) {
      const known = catalog.find((c) => c.name.toLowerCase() === value.trim().toLowerCase());
      if (known?.dose_unit) setDoseUnit(known.dose_unit);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || doseValue === "" || !takenAt) return;
    setSaving(true);
    setError("");
    try {
      await onAdd({ name: name.trim(), doseValue: Number(doseValue), doseUnit: doseUnit.trim(), takenAt });
      setDoseValue("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-md border border-ink/10 bg-paper p-3 mt-3">
      <div className="flex flex-wrap gap-2">
        <input
          list="medication-name-suggestions"
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Название"
          className="flex-1 min-w-[8rem] text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5"
        />
        <datalist id="medication-name-suggestions">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <input
          type="number"
          step="any"
          value={doseValue}
          onChange={(e) => setDoseValue(e.target.value)}
          placeholder="Доза"
          className="w-20 text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5"
        />
        <input
          type="text"
          value={doseUnit}
          onChange={(e) => setDoseUnit(e.target.value)}
          placeholder="ед."
          className="w-16 text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5"
        />
        <input
          type="date"
          value={takenAt}
          onChange={(e) => setTakenAt(e.target.value)}
          className="text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5"
        />
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
      <div className="flex items-center gap-3 mt-2">
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

  // Different lab documents can print slightly different reference ranges
  // for the same biomarker (different equipment/method, or one document
  // simply missing the printed norm) — comparing each point against its own
  // row's range made the trend line flip which points count as "abnormal"
  // depending on which document a value happened to come from. Every point
  // is compared against the one range shown on this card (refLow/refHigh)
  // instead, so the whole series reads against a single consistent norm.
  const series = useMemo(
    () =>
      numericRows.map((b) => ({
        date: b.measured_at ? new Date(b.measured_at).toLocaleDateString("ru-RU") : "—",
        value: Number(b.value),
        unit: b.unit,
        flagged: b.flagged_for_review,
        outOfRange: hasRange && (Number(b.value) < refLow || Number(b.value) > refHigh),
      })),
    [numericRows, hasRange, refLow, refHigh]
  );

  // Include the reference range in the Y domain — otherwise a patient's values
  // that are entirely above/below the norm push the norm band off-screen.
  // Domain entries are functions so Recharts still picks its own "nice"
  // rounded tick values around whatever min/max results (a manually padded
  // domain with non-round numbers made Recharts render a garbage bottom tick
  // — that's also why the edge headroom is done in pixels via YAxis padding
  // below, not by arithmetically padding the domain).
  const yDomain = hasRange
    ? [(dataMin) => Math.min(dataMin, refLow), (dataMax) => Math.max(dataMax, refHigh)]
    : ["auto", "auto"];

  // --- Приём лекарств ---
  const [selectedMedName, setSelectedMedName] = useState(null);
  const [overlayMedName, setOverlayMedName] = useState(null);
  const [showAddDose, setShowAddDose] = useState(false);
  const [medError, setMedError] = useState("");

  const { data: medNamesRes, mutate: mutateMedNames } = useSWR("medicationNames", () => api.listMedicationNames());
  const medNames = medNamesRes?.names ?? [];
  const { data: medCatalogRes, mutate: mutateMedCatalog } = useSWR("medicationCatalog", () => api.listMedicationCatalog());
  const medCatalog = medCatalogRes?.catalog ?? [];

  useEffect(() => {
    if (!selectedMedName && medNames.length > 0) setSelectedMedName(medNames[0]);
  }, [medNames, selectedMedName]);

  const { data: medDosesRes, mutate: mutateMedDoses } = useSWR(
    selectedMedName ? ["medications", selectedMedName] : null,
    () => api.listMedications(selectedMedName)
  );
  const medDoses = medDosesRes?.doses ?? [];

  // Only fetched when an overlay is actually picked on the biomarker chart
  // above — a separate query keyed by its own name, independent of
  // selectedMedName (the standalone medication chart below can show a
  // different medication than the one overlaid).
  const { data: overlayDosesRes } = useSWR(
    overlayMedName ? ["medications", overlayMedName] : null,
    () => api.listMedications(overlayMedName)
  );
  const overlayDoses = overlayDosesRes?.doses ?? [];

  const medGroups = useMemo(() => [{ label: "Лекарства", names: medNames }], [medNames]);
  const medUnit = medDoses.find((d) => d.dose_unit)?.dose_unit || "";

  const medSeries = useMemo(
    () =>
      medDoses.map((d) => ({
        date: new Date(d.taken_at).toLocaleDateString("ru-RU"),
        dose: Number(d.dose_value),
        doseUnit: d.dose_unit,
      })),
    [medDoses]
  );

  // Merges the biomarker series with the overlaid medication's doses onto a
  // shared set of date categories (union of both sets of dates, sorted) —
  // each line just has a null at any date it has no point for, so Recharts
  // draws a gap there instead of a data point, and `connectNulls` keeps the
  // line itself continuous across those gaps rather than breaking it. Doses
  // are usually logged far more densely (near-daily) than lab draws, so
  // most categories on the merged axis only ever populate the dose line.
  const combinedSeries = useMemo(() => {
    if (!overlayMedName) return series;
    const doseUnitForOverlay = overlayDoses.find((d) => d.dose_unit)?.dose_unit || "";
    const biomarkerByDate = new Map(numericRows.filter((r) => r.measured_at).map((r) => [r.measured_at, r]));
    const doseByDate = new Map(overlayDoses.map((d) => [d.taken_at, d]));
    const allDates = Array.from(new Set([...biomarkerByDate.keys(), ...doseByDate.keys()])).sort();
    return allDates.map((isoDate) => {
      const b = biomarkerByDate.get(isoDate);
      const d = doseByDate.get(isoDate);
      return {
        date: new Date(isoDate).toLocaleDateString("ru-RU"),
        value: b ? Number(b.value) : null,
        unit,
        dose: d ? Number(d.dose_value) : null,
        doseUnit: doseUnitForOverlay,
        flagged: b?.flagged_for_review ?? false,
        outOfRange: b ? hasRange && (Number(b.value) < refLow || Number(b.value) > refHigh) : false,
      };
    });
  }, [overlayMedName, series, overlayDoses, numericRows, unit, hasRange, refLow, refHigh]);

  const chartData = overlayMedName ? combinedSeries : series;
  // Category axes render one tick per data point by default — fine for the
  // handful of lab draws a biomarker series usually has, unreadable once
  // hundreds of near-daily dose entries are merged in. Thins ticks down to
  // roughly 8 regardless of how many points are on the axis.
  const xTickInterval = Math.max(0, Math.ceil(chartData.length / 8) - 1);
  const medXTickInterval = Math.max(0, Math.ceil(medSeries.length / 8) - 1);

  async function handleAddDose(body) {
    await api.addMedicationDose(body);
    await Promise.all([mutateMedDoses(), mutateMedNames(), mutateMedCatalog()]);
    setShowAddDose(false);
  }

  async function handleDeleteDose(id) {
    try {
      await api.deleteMedicationDose(id);
      await mutateMedDoses();
    } catch (err) {
      setMedError(err.message);
    }
  }

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
          <p className="text-xs text-ink/50 mb-1">
            Норма: {refLow}–{refHigh} {unit}
          </p>
        )}
        {medNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-ink/50 shrink-0">Наложить приём лекарства:</span>
            <BiomarkerPicker
              groups={medGroups}
              value={overlayMedName}
              onChange={setOverlayMedName}
              allowClear
              clearLabel="Не показывать"
            />
          </div>
        )}
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} interval={xTickInterval} />
              {/* padding — пиксельный запас сверху/снизу: точка на границе
                  домена (значение выше нормы) не обрезается краем графика,
                  а тики остаются «круглыми» (см. комментарий к yDomain). */}
              <YAxis yAxisId="left" tick={{ fontSize: 12 }} domain={yDomain} padding={{ top: 8, bottom: 8 }} />
              {overlayMedName && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12, fill: chartColors.dose }}
                  padding={{ top: 8, bottom: 8 }}
                />
              )}
              <Tooltip content={<ChartTooltip colors={chartColors} withLabels={!!overlayMedName} />} />
              {overlayMedName && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {hasRange && (
                <ReferenceArea yAxisId="left" y1={refLow} y2={refHigh} fill={chartColors.range} fillOpacity={0.1} strokeOpacity={0} />
              )}
              {hasRange && (
                <ReferenceLine
                  yAxisId="left"
                  y={refLow}
                  stroke={chartColors.range}
                  strokeDasharray="4 4"
                  label={{ value: "норма", fontSize: 10, fill: chartColors.range, position: "insideBottomLeft" }}
                />
              )}
              {hasRange && <ReferenceLine yAxisId="left" y={refHigh} stroke={chartColors.range} strokeDasharray="4 4" />}
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="value"
                name={selectedName}
                connectNulls
                stroke={chartColors.line}
                strokeWidth={2}
                isAnimationActive={false}
                dot={({ key, ...dotProps }) => <ChartDot key={key} {...dotProps} colors={chartColors} />}
              />
              {overlayMedName && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="dose"
                  name={`${overlayMedName}, доза`}
                  connectNulls
                  stroke={chartColors.dose}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        ) : qualitativeList.length === 0 ? (
          <p className="text-sm text-ink/50">Нет данных для отображения. Загрузите анализы в разделе «Документы».</p>
        ) : null}
        {qualitativeList.length > 0 && (
          <div className={chartData.length > 0 ? "mt-4 pt-4 border-t border-ink/10" : ""}>
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

      <div className="rounded-lg border border-ink/10 bg-surface p-5 mb-10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <p className="font-medium">
            Приём лекарств{medUnit && <span className="text-ink/50 font-normal"> ({medUnit})</span>}
          </p>
          {medNames.length > 0 && (
            <BiomarkerPicker groups={medGroups} value={selectedMedName} onChange={setSelectedMedName} placeholder="Выберите лекарство" />
          )}
        </div>

        {medError && <p className="text-sm text-danger mb-2">{medError}</p>}

        {medSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={medSeries} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} interval={medXTickInterval} />
              <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} padding={{ top: 8, bottom: 8 }} />
              <Tooltip content={<ChartTooltip colors={chartColors} />} />
              <Line
                type="monotone"
                dataKey="dose"
                stroke={chartColors.dose}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-ink/50 mb-2">
            {selectedMedName ? "Для этого лекарства пока нет записей о приёме." : "Добавьте лекарство, чтобы увидеть график."}
          </p>
        )}

        {medDoses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-ink/10">
            <p className="text-xs font-medium text-ink/60 mb-1">
              Последние записи
              {medDoses.length > 10 && <span className="text-ink/40 font-normal"> (показаны последние 10 из {medDoses.length})</span>}
            </p>
            <ul className="space-y-1">
              {[...medDoses]
                .slice(-10)
                .reverse()
                .map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-xs gap-3">
                    <span className="text-ink/50 shrink-0">{new Date(d.taken_at).toLocaleDateString("ru-RU")}</span>
                    <span className="flex-1 text-right">
                      {d.dose_value} {d.dose_unit}
                    </span>
                    <button type="button" onClick={() => handleDeleteDose(d.id)} className="text-danger/60 hover:text-danger shrink-0">
                      удалить
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {showAddDose ? (
          <AddDoseForm names={medNames} catalog={medCatalog} onAdd={handleAddDose} onCancel={() => setShowAddDose(false)} />
        ) : (
          <button
            type="button"
            onClick={() => setShowAddDose(true)}
            className="mt-3 text-xs text-moss border border-moss/40 rounded-full px-3 py-1.5 hover:border-moss/70 transition-colors"
          >
            + добавить приём
          </button>
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
              <p className="text-sm text-ink/40">
                Записей пока нет — они появляются при обработке медицинских документов (выписок, заключений).
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
