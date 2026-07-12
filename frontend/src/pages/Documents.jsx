import { useEffect, useState, useRef } from "react";
import { api } from "../api/client.js";

const TYPE_LABELS = {
  lab_result: "Анализ",
  prescription: "Назначение",
  imaging: "Снимок",
  other: "Другое",
};

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [details, setDetails] = useState({});
  const fileInputRef = useRef();

  async function loadDocuments() {
    const res = await api.listDocuments();
    setDocuments(res.documents);
  }

  useEffect(() => {
    loadDocuments();
  }, []);

  async function toggleExpand(doc) {
    if (expandedId === doc.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(doc.id);
    if (!details[doc.id]) {
      const res = await api.getDocument(doc.id);
      setDetails((prev) => ({ ...prev, [doc.id]: res }));
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      await api.uploadDocument(file, "lab_result");
      await loadDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <p className="font-display font-light tracking-tight text-3xl mb-1">Документы</p>
      <p className="text-ink/60 mb-6">Загружайте анализы, выписки и снимки — мы распознаем и структурируем их</p>

      <label className="block border-2 border-dashed border-ink/20 rounded-lg p-8 text-center cursor-pointer hover:border-moss/50 transition-colors mb-8 bg-surface">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
        <p className="text-sm text-ink/60">
          {uploading ? "Загружаем и распознаём…" : "Нажмите, чтобы выбрать файл (PDF, JPG, PNG)"}
        </p>
      </label>
      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      <div className="space-y-2">
        {documents.map((doc) => {
          const isExpanded = expandedId === doc.id;
          const detail = details[doc.id];
          const canExpand = doc.status !== "processing";
          return (
            <div key={doc.id} className="rounded-md border border-ink/10 bg-surface px-4 py-3">
              <button
                type="button"
                onClick={() => canExpand && toggleExpand(doc)}
                className={`w-full text-left ${canExpand ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{doc.original_filename}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    doc.status === "parsed" ? "bg-moss/10 text-moss" :
                    doc.status === "failed" ? "bg-danger/10 text-danger" : "bg-amber/10 text-amber"
                  }`}>
                    {doc.status === "parsed" ? "обработан" : doc.status === "failed" ? "ошибка" : "обрабатывается"}
                  </span>
                </div>
                <p className="text-xs text-ink/40 mt-1">
                  {TYPE_LABELS[doc.document_type] || "Другое"} · {new Date(doc.created_at).toLocaleDateString("ru-RU")}
                  {canExpand && <span className="text-moss/70"> · {isExpanded ? "скрыть подробности" : "показать, что распозналось"}</span>}
                </p>
              </button>

              {isExpanded && (
                <div className="mt-3 pt-3 border-t border-ink/10">
                  {!detail ? (
                    <p className="text-xs text-ink/40">Загружаем…</p>
                  ) : doc.status === "failed" ? (
                    <p className="text-xs text-danger">Не удалось обработать документ.</p>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-ink/60 mb-1">
                        Найденные показатели{detail.biomarkers.length > 0 ? ` (${detail.biomarkers.length})` : ""}
                      </p>
                      {detail.biomarkers.length > 0 ? (
                        <div className="space-y-1 mb-3">
                          {detail.biomarkers.map((b) => (
                            <div key={b.id} className="flex items-center justify-between text-xs bg-paper rounded px-2 py-1">
                              <span>{b.name}</span>
                              <span className="text-ink/60">
                                {b.value} {b.unit}
                                {(b.ref_range_low != null || b.ref_range_high != null) &&
                                  ` (норма ${b.ref_range_low ?? "?"}–${b.ref_range_high ?? "?"})`}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-ink/40 mb-3">
                          Показатели не найдены — модель не распознала в этом документе числовые лабораторные значения.
                        </p>
                      )}

                      <p className="text-xs font-medium text-ink/60 mb-1">Распознанный текст</p>
                      <pre className="text-xs text-ink/60 bg-paper rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-body">
                        {detail.document.raw_text || "Текст пуст."}
                      </pre>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {documents.length === 0 && <p className="text-sm text-ink/50">Загруженных документов пока нет.</p>}
      </div>
    </div>
  );
}
