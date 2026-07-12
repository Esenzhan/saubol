import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client.js";

export default function Dashboard() {
  const [documents, setDocuments] = useState([]);
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.listDocuments(), api.listBiomarkerNames()])
      .then(([docRes, namesRes]) => {
        setDocuments(docRes.documents);
        setNames(namesRes.names);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink/50">Загрузка…</p>;

  return (
    <div>
      <p className="font-display font-light tracking-tight text-3xl mb-1">Обзор</p>
      <p className="text-ink/60 mb-8">Сводка по вашим документам и показателям</p>

      <div className="grid grid-cols-2 gap-4 mb-10">
        <div className="rounded-lg border border-ink/10 bg-surface p-5">
          <p className="text-3xl font-display font-light tabular-nums">{documents.length}</p>
          <p className="text-sm text-ink/50 mt-1">документов загружено</p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-surface p-5">
          <p className="text-3xl font-display font-light tabular-nums">{names.length}</p>
          <p className="text-sm text-ink/50 mt-1">отслеживаемых показателей</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="font-medium">Последние документы</p>
        <Link to="/documents" className="text-sm text-moss">Все документы →</Link>
      </div>
      <div className="space-y-2">
        {documents.slice(0, 5).map((doc) => (
          <div key={doc.id} className="flex items-center justify-between rounded-md border border-ink/10 bg-surface px-4 py-3">
            <span className="text-sm">{doc.original_filename}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              doc.status === "parsed" ? "bg-moss/10 text-moss" :
              doc.status === "failed" ? "bg-danger/10 text-danger" : "bg-amber/10 text-amber"
            }`}>
              {doc.status === "parsed" ? "обработан" : doc.status === "failed" ? "ошибка" : "обрабатывается"}
            </span>
          </div>
        ))}
        {documents.length === 0 && (
          <p className="text-sm text-ink/50">Пока нет загруженных документов. Начните с раздела «Документы».</p>
        )}
      </div>
    </div>
  );
}
