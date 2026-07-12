import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "../api/client.js";

const SECTIONS = [
  { key: "diagnosis", label: "Диагнозы" },
  { key: "medication", label: "Лекарства" },
  { key: "recommendation", label: "Рекомендации" },
  { key: "allergy", label: "Аллергии" },
];

export default function MedCard() {
  const [names, setNames] = useState([]);
  const [selectedName, setSelectedName] = useState(null);
  const [series, setSeries] = useState([]);
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
    api.listBiomarkers(selectedName).then((res) =>
      setSeries(
        res.biomarkers.map((b) => ({
          date: b.measured_at ? new Date(b.measured_at).toLocaleDateString("ru-RU") : "—",
          value: Number(b.value),
        }))
      )
    );
  }, [selectedName]);

  return (
    <div>
      <p className="font-display text-3xl mb-1">Медкарта</p>
      <p className="text-ink/60 mb-8">Динамика показателей и структурированные записи</p>

      <div className="rounded-lg border border-ink/10 bg-white p-5 mb-10">
        <div className="flex items-center justify-between mb-4">
          <p className="font-medium">Динамика показателя</p>
          {names.length > 0 && (
            <select
              value={selectedName || ""}
              onChange={(e) => setSelectedName(e.target.value)}
              className="text-sm border border-ink/15 rounded-md px-2 py-1"
            >
              {names.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
        </div>
        {series.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#12261E1A" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#2F5D50" strokeWidth={2} dot={{ r: 3 }} />
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
              <div key={entry.id} className="rounded-md border border-ink/10 bg-white px-4 py-3">
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
