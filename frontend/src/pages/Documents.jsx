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
  const fileInputRef = useRef();

  async function loadDocuments() {
    const res = await api.listDocuments();
    setDocuments(res.documents);
  }

  useEffect(() => {
    loadDocuments();
  }, []);

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
      <p className="font-display text-3xl mb-1">Документы</p>
      <p className="text-ink/60 mb-6">Загружайте анализы, выписки и снимки — мы распознаем и структурируем их</p>

      <label className="block border-2 border-dashed border-ink/20 rounded-lg p-8 text-center cursor-pointer hover:border-moss/50 transition-colors mb-8 bg-white">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
        <p className="text-sm text-ink/60">
          {uploading ? "Загружаем и распознаём…" : "Нажмите, чтобы выбрать файл (PDF, JPG, PNG)"}
        </p>
      </label>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="rounded-md border border-ink/10 bg-white px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{doc.original_filename}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                doc.status === "parsed" ? "bg-moss/10 text-moss" :
                doc.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber/10 text-amber"
              }`}>
                {doc.status === "parsed" ? "обработан" : doc.status === "failed" ? "ошибка" : "обрабатывается"}
              </span>
            </div>
            <p className="text-xs text-ink/40 mt-1">{TYPE_LABELS[doc.document_type] || "Другое"} · {new Date(doc.created_at).toLocaleDateString("ru-RU")}</p>
          </div>
        ))}
        {documents.length === 0 && <p className="text-sm text-ink/50">Загруженных документов пока нет.</p>}
      </div>
    </div>
  );
}
