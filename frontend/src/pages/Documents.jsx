import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api } from "../api/client.js";
import { groupDocumentsByFolder, FOLDER_META } from "../documentFolders.js";

const HUE_CLASSES = {
  accent: "bg-moss text-onaccent",
  pending: "bg-amber text-onaccent",
  danger: "bg-danger text-onaccent",
  ink: "bg-ink/70 text-onaccent",
};

function FolderIcon({ label, className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: FOLDER_META[label]?.icon || "" }}
    />
  );
}

function FolderCard({ label, count, onClick }) {
  const hue = FOLDER_META[label]?.hue || "ink";
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg bg-surface p-4 flex flex-col gap-3 text-left hover:opacity-90 transition-opacity"
    >
      <span className={`w-9 h-9 rounded-full flex items-center justify-center ${HUE_CLASSES[hue]}`}>
        <FolderIcon label={label} className="w-5 h-5" />
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-ink/50 mt-0.5">
          {count} {count === 1 ? "документ" : "документов"}
        </span>
      </span>
    </button>
  );
}

function UploadButton({ uploading, onSelect }) {
  const fileInputRef = useRef();
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-moss border border-moss/40 rounded-full px-3 py-1.5 cursor-pointer hover:border-moss/70 transition-colors">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={(e) => {
          const file = e.target.files[0];
          if (file) onSelect(file);
          fileInputRef.current.value = "";
        }}
      />
      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
      {uploading ? "загружаем…" : "добавить документ"}
    </label>
  );
}

function DocumentRow({ doc, isExpanded, onToggle, onReview }) {
  const canExpand = doc.status !== "processing";
  const [opening, setOpening] = useState(false);
  const { data: detail } = useSWR(isExpanded ? ["document", doc.id] : null, () => api.getDocument(doc.id));

  async function handleOpenOriginal(e) {
    e.stopPropagation();
    setOpening(true);
    try {
      await api.openDocumentFile(doc.id);
    } catch (err) {
      console.error(err);
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="rounded-md border border-ink/10 bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => canExpand && onToggle(doc.id)}
          className={`flex-1 min-w-0 text-left ${canExpand ? "cursor-pointer" : "cursor-default"}`}
        >
          <span className="text-sm font-medium block truncate">{doc.display_name || doc.original_filename}</span>
        </button>
        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
          doc.status === "parsed" ? "bg-moss/10 text-moss" :
          doc.status === "failed" ? "bg-danger/10 text-danger" : "bg-amber/10 text-amber"
        }`}>
          {doc.status === "parsed" ? "обработан" : doc.status === "failed" ? "ошибка" : "обрабатывается"}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1 gap-2">
        <p className="text-xs text-ink/40">
          {new Date(doc.created_at).toLocaleDateString("ru-RU")}
          {canExpand && (
            <button type="button" onClick={() => onToggle(doc.id)} className="text-moss/70 hover:text-moss ml-1">
              · {isExpanded ? "скрыть подробности" : "показать, что распозналось"}
            </button>
          )}
        </p>
        <button
          type="button"
          onClick={handleOpenOriginal}
          disabled={opening}
          className="shrink-0 text-xs text-moss hover:text-moss/80 disabled:opacity-50"
        >
          {opening ? "открываем…" : "открыть оригинал"}
        </button>
      </div>

      {doc.pending_review && (
        <button
          type="button"
          onClick={() => onReview(doc.id)}
          className="mt-2 w-full text-xs text-amber bg-amber/10 border border-amber/30 rounded-md px-3 py-2 text-left hover:bg-amber/15 transition-colors"
        >
          Показатели ждут подтверждения — проверить →
        </button>
      )}

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-ink/10">
          {!detail ? (
            <p className="text-xs text-ink/40">Загружаем…</p>
          ) : doc.status === "failed" ? (
            <p className="text-xs text-danger">Не удалось обработать документ.</p>
          ) : (
            <>
              {detail.biomarkers.length > 0 && (
                <>
                  <p className="text-xs font-medium text-ink/60 mb-1">
                    Показатели ({detail.biomarkers.length})
                  </p>
                  <div className="space-y-1 mb-3">
                    {detail.biomarkers.map((b) => (
                      <div key={b.id} className="flex items-center justify-between text-xs bg-paper rounded px-2 py-1">
                        <span>{b.name}</span>
                        <span className="text-ink/60">
                          {b.value !== null ? (
                            <>
                              {b.value} {b.unit}
                              {(b.ref_range_low != null || b.ref_range_high != null) &&
                                ` (норма ${b.ref_range_low ?? "?"}–${b.ref_range_high ?? "?"})`}
                            </>
                          ) : (
                            b.value_text
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {detail.document.raw_text && (
                <>
                  <p className="text-xs font-medium text-ink/60 mb-1">Распознанный текст</p>
                  <pre className="text-xs text-ink/60 bg-paper rounded p-2 max-h-48 overflow-y-auto whitespace-pre-wrap font-body">
                    {detail.document.raw_text}
                  </pre>
                </>
              )}

              {detail.biomarkers.length === 0 && !detail.document.raw_text && (
                <p className="text-xs text-ink/40">Документ сохранён, распознавание для него не выполняется.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FolderSection({ label, count, nested, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={nested ? "ml-4 mt-2" : "mb-3"}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between rounded-md border border-ink/10 bg-surface px-4 py-3 text-left hover:border-moss/40 transition-colors ${
          nested ? "text-sm" : "font-medium"
        }`}
      >
        <span>{label}</span>
        <span className="text-xs text-ink/40">{count} · {open ? "свернуть" : "открыть"}</span>
      </button>
      {open && <div className="mt-2 space-y-2">{children}</div>}
    </div>
  );
}

function FolderDetail({ folder, uploading, onUpload, onBack, expandedId, onToggle, onReview }) {
  return (
    <div>
      <button type="button" onClick={onBack} className="text-sm text-ink/50 hover:text-ink mb-3 inline-flex items-center gap-1">
        ← Документы
      </button>
      <div className="flex items-center justify-between gap-3 mb-5">
        <p className="font-display font-light tracking-tight text-2xl">{folder.label}</p>
        <UploadButton uploading={uploading} onSelect={onUpload} />
      </div>

      {folder.subfolders
        ? folder.subfolders.map((sub) => (
            <FolderSection key={sub.label} label={sub.label} count={sub.documents.length} nested={false}>
              {sub.documents.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} isExpanded={expandedId === doc.id} onToggle={onToggle} onReview={onReview} />
              ))}
            </FolderSection>
          ))
        : folder.documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} isExpanded={expandedId === doc.id} onToggle={onToggle} onReview={onReview} />
          ))}

      {folder.count === 0 && <p className="text-sm text-ink/50">В этой папке пока нет документов.</p>}
    </div>
  );
}

function ReviewField({ row, onChange }) {
  const isQualitative = row.value === null && row.value_text !== null && row.value_text !== undefined;
  return (
    <div className={`rounded-md border px-3 py-2.5 ${row.flagged_for_review ? "border-amber/50 bg-amber/10" : "border-ink/10 bg-surface"}`}>
      <div className="flex items-center gap-1.5 mb-2">
        {row.flagged_for_review && <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />}
        <span className="text-sm font-semibold">{row.name}</span>
      </div>
      {row.flagged_for_review && (
        <p className="text-xs text-amber/90 mb-2">Похоже на ошибку распознавания — сверьте с оригиналом.</p>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="decimal"
          value={isQualitative ? row.value_text ?? "" : row.value ?? ""}
          onChange={(e) => onChange(isQualitative ? { value_text: e.target.value } : { value: e.target.value })}
          placeholder={isQualitative ? "результат" : "значение"}
          className="min-w-0 flex-1 text-sm bg-paper border border-ink/15 rounded-md px-2 py-1.5"
        />
        {!isQualitative && (
          <input
            type="text"
            value={row.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="ед."
            className="w-16 shrink-0 text-sm bg-paper border border-ink/15 rounded-md px-2 py-1.5"
          />
        )}
      </div>
    </div>
  );
}

function AddBiomarkerPicker({ catalog, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? catalog.filter((c) => c.name.toLowerCase().includes(q)) : catalog;
    return list.slice(0, 30);
  }, [catalog, query]);

  return (
    <div className="rounded-md border border-ink/15 bg-surface p-3 mb-3">
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Поиск показателя из истории…"
        className="w-full text-sm bg-paper border border-ink/15 rounded-md px-2 py-1.5 mb-2"
      />
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {matches.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => onPick(c)}
            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-paper flex items-center justify-between gap-2"
          >
            <span>{c.name}</span>
            {c.unit && <span className="text-xs text-ink/40 shrink-0">{c.unit}</span>}
          </button>
        ))}
        {matches.length === 0 && <p className="text-xs text-ink/40 px-2 py-1.5">Ничего не найдено — впишите название вручную.</p>}
      </div>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-ink/10">
        <input
          type="text"
          placeholder="или новое название показателя"
          className="min-w-0 flex-1 text-sm bg-paper border border-ink/15 rounded-md px-2 py-1.5"
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.currentTarget.value.trim()) {
              onPick({ name: e.currentTarget.value.trim(), unit: "" });
            }
          }}
        />
        <button type="button" onClick={onClose} className="text-xs text-ink/50 hover:text-ink shrink-0">
          отмена
        </button>
      </div>
    </div>
  );
}

function ReviewPanel({ documentId, onClose, onDone }) {
  const { data: docData } = useSWR(["document", documentId, "review"], () => api.getDocument(documentId));
  const { data: catalogRes } = useSWR("biomarkerCatalog", () => api.listBiomarkerCatalog());
  const catalog = catalogRes?.catalog ?? [];

  const [edits, setEdits] = useState(null);
  const [additions, setAdditions] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const pending = docData?.biomarkers.filter((b) => !b.confirmed) ?? [];
  if (edits === null && docData) {
    setEdits(Object.fromEntries(pending.map((b) => [b.id, { value: b.value, value_text: b.value_text, unit: b.unit }])));
  }

  function updateRow(id, patch) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function addRow(entry) {
    setAdditions((prev) => [...prev, { key: `new-${prev.length}-${entry.name}`, name: entry.name, unit: entry.unit || "", value: "", value_text: "" }]);
    setShowPicker(false);
  }

  function updateAddition(key, patch) {
    setAdditions((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  async function handleConfirm() {
    setSaving(true);
    setError("");
    try {
      const updates = pending.map((b) => {
        const e = edits[b.id];
        const isQualitative = b.value === null && b.value_text !== null;
        return {
          id: b.id,
          value: isQualitative ? null : e.value === "" || e.value === null ? null : Number(e.value),
          value_text: isQualitative ? e.value_text || null : null,
          unit: e.unit || null,
        };
      });
      const validAdditions = additions
        .filter((a) => a.value || a.value_text)
        .map((a) => ({
          name: a.name,
          value: a.value === "" ? null : Number(a.value) || null,
          value_text: a.value ? null : a.value_text || null,
          unit: a.unit || null,
        }));
      await api.reviewDocument(documentId, { updates, additions: validAdditions });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4">
      <div className="bg-paper w-full sm:max-w-md sm:rounded-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-display font-light tracking-tight text-xl">Проверьте показатели</p>
          <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink text-sm">
            закрыть
          </button>
        </div>
        <p className="text-xs text-ink/50 mb-4">{docData?.document.display_name || docData?.document.original_filename}</p>

        {!docData || edits === null ? (
          <p className="text-sm text-ink/50">Загружаем…</p>
        ) : (
          <>
            <div className="space-y-2 mb-3">
              {pending.map((b) => (
                <ReviewField key={b.id} row={{ ...b, ...edits[b.id] }} onChange={(patch) => updateRow(b.id, patch)} />
              ))}
              {additions.map((a) => (
                <ReviewField
                  key={a.key}
                  row={{ name: a.name, value: a.value === "" ? "" : a.value, value_text: a.value_text, unit: a.unit, flagged_for_review: false }}
                  onChange={(patch) => updateAddition(a.key, patch)}
                />
              ))}
              {pending.length === 0 && additions.length === 0 && (
                <p className="text-sm text-ink/50">Показатели не найдены — модель не распознала в этом документе лабораторные значения.</p>
              )}
            </div>

            {showPicker ? (
              <AddBiomarkerPicker catalog={catalog} onPick={addRow} onClose={() => setShowPicker(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="w-full text-sm text-moss border border-dashed border-moss/40 rounded-md py-2 mb-2 hover:border-moss/70 transition-colors"
              >
                + добавить показатель, которого нет в списке
              </button>
            )}

            {error && <p className="text-sm text-danger mb-2">{error}</p>}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving || (pending.length === 0 && additions.length === 0)}
              className="w-full bg-moss text-onaccent rounded-md py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? "сохраняем…" : `Подтвердить ${pending.length + additions.filter((a) => a.value || a.value_text).length} показателей`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Documents() {
  const { data: docRes, mutate: mutateDocuments } = useSWR("documents", () => api.listDocuments(), {
    refreshInterval: (data) => (data?.documents.some((d) => d.status === "processing") ? 3000 : 0),
  });
  const documents = docRes?.documents ?? [];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [openFolderLabel, setOpenFolderLabel] = useState(null);
  const [reviewDocId, setReviewDocId] = useState(null);

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function handleUpload(file) {
    setUploading(true);
    setError("");
    try {
      await api.uploadDocument(file, openFolderLabel);
      await mutateDocuments();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  const folders = groupDocumentsByFolder(documents);
  const openFolder = folders.find((f) => f.label === openFolderLabel);

  return (
    <div>
      {!openFolder ? (
        <>
          <p className="font-display font-light tracking-tight text-3xl mb-1">Документы</p>
          <p className="text-ink/60 mb-6">Загружайте анализы, выписки и снимки — мы распознаем и структурируем их</p>
          <div className="grid grid-cols-2 gap-3">
            {folders.map((f) => (
              <FolderCard key={f.label} label={f.label} count={f.count} onClick={() => setOpenFolderLabel(f.label)} />
            ))}
          </div>
        </>
      ) : (
        <FolderDetail
          folder={openFolder}
          uploading={uploading}
          onUpload={handleUpload}
          onBack={() => setOpenFolderLabel(null)}
          expandedId={expandedId}
          onToggle={toggleExpand}
          onReview={setReviewDocId}
        />
      )}
      {error && <p className="text-sm text-danger mt-4">{error}</p>}

      {reviewDocId && (
        <ReviewPanel
          documentId={reviewDocId}
          onClose={() => setReviewDocId(null)}
          onDone={async () => {
            setReviewDocId(null);
            await mutateDocuments();
          }}
        />
      )}
    </div>
  );
}
