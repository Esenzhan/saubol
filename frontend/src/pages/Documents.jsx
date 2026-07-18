import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api } from "../api/client.js";
import { groupDocumentsByFolder, FOLDER_META, folderPathLabel, MOVE_TARGETS } from "../documentFolders.js";
import { documentTitle, documentSecondaryDate, documentUploadDate } from "../documentDisplay.js";

// Percent ranges for the blended upload+processing progress bar. Upload
// progress is real (byte-accurate, from XHR); processing has no equivalent
// signal from the server (OCR + AI classification give no intermediate
// events), so it eases toward — but never quite reaches — PROCESSING_CEILING
// until the document list poll reports the document as parsed/failed, at
// which point it snaps straight to 100.
const UPLOAD_CEILING = 25;
const PROCESSING_CEILING = 92;

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

function FolderCard({ label, count, onClick, onUpload }) {
  const hue = FOLDER_META[label]?.hue || "ink";
  return (
    <div className="relative">
      {/* «+» — это label с файловым инпутом поверх карточки, потому что
          кнопку в кнопку вкладывать нельзя; сама карточка остаётся обычной
          кнопкой открытия папки. */}
      <label
        aria-label={`Загрузить документ в папку «${label}»`}
        title={`Загрузить в «${label}»`}
        className="absolute top-3 right-3 z-10 w-7 h-7 rounded-full border border-ink/15 bg-paper text-ink/50 hover:text-moss hover:border-moss/50 flex items-center justify-center cursor-pointer transition-colors"
      >
        <input
          type="file"
          className="hidden"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={(e) => {
            const file = e.target.files[0];
            if (file) onUpload(file, label);
            e.target.value = "";
          }}
        />
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </label>
      <button
        type="button"
        aria-label={`Открыть папку «${label}», ${count} ${count === 1 ? "документ" : "документов"}`}
        onClick={onClick}
        className="w-full rounded-lg bg-surface p-4 flex flex-col gap-3 text-left hover:opacity-90 transition-opacity"
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
    </div>
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

// Значение вне референсного диапазона — главный сигнал для пользователя,
// выделяется цветом и стрелкой направления в списке показателей.
function biomarkerDeviation(b) {
  if (b.value === null || b.value === undefined) return null;
  const v = Number(b.value);
  if (b.ref_range_low != null && v < Number(b.ref_range_low)) return "↓";
  if (b.ref_range_high != null && v > Number(b.ref_range_high)) return "↑";
  return null;
}

function DocumentRow({ doc, isExpanded, onToggle, onReview, onDelete, onMove }) {
  const canExpand = doc.status !== "processing";
  const [opening, setOpening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: detail } = useSWR(isExpanded ? ["document", doc.id] : null, () => api.getDocument(doc.id));

  async function handleDelete() {
    if (!window.confirm(`Удалить «${documentTitle(doc)}» вместе с его показателями? Это действие необратимо.`)) return;
    setDeleting(true);
    try {
      await onDelete(doc.id);
    } finally {
      setDeleting(false);
    }
  }

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
          <span className="text-sm font-medium block truncate">{documentTitle(doc)}</span>
        </button>
        {/* «обработан» — состояние по умолчанию, бейдж для него был бы шумом
            и отъедал бы ширину у названия; показываем только отклонения. */}
        {doc.status !== "parsed" && (
          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${
            doc.status === "failed" ? "bg-danger/10 text-danger" : "bg-amber/10 text-amber"
          }`}>
            {doc.status === "failed" ? "ошибка" : "обрабатывается"}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between mt-1 gap-2">
        <p className="text-xs text-ink/40">
          {documentSecondaryDate(doc)}
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
                    {detail.biomarkers.map((b) => {
                      const deviation = biomarkerDeviation(b);
                      return (
                        <div key={b.id} className="flex items-center justify-between text-xs bg-paper rounded px-2 py-1">
                          <span>{b.name}</span>
                          <span className={deviation ? "text-danger font-medium" : "text-ink/60"}>
                            {b.value !== null ? (
                              <>
                                {deviation && `${deviation} `}
                                {b.value} {b.unit}
                                {(b.ref_range_low != null || b.ref_range_high != null) && (
                                  <span className="text-ink/40 font-normal">
                                    {` (норма ${b.ref_range_low ?? "?"}–${b.ref_range_high ?? "?"})`}
                                  </span>
                                )}
                              </>
                            ) : (
                              b.value_text
                            )}
                          </span>
                        </div>
                      );
                    })}
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

          {/* Вне ветки успешной загрузки деталей: удалить можно и документ,
              который не удалось обработать — такие хочется убрать чаще всего. */}
          {detail && (
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-ink/5">
              <p className="text-xs text-ink/40">Загружен {documentUploadDate(doc)}</p>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onMove(doc.id)}
                  className="text-xs text-moss/80 hover:text-moss transition-colors"
                >
                  перенести
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs text-danger/70 hover:text-danger disabled:opacity-50 transition-colors"
                >
                  {deleting ? "удаляем…" : "удалить"}
                </button>
              </div>
            </div>
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

function FolderDetail({ folder, uploading, onUpload, onBack, expandedId, onToggle, onReview, onDelete, onMove }) {
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
                <DocumentRow key={doc.id} doc={doc} isExpanded={expandedId === doc.id} onToggle={onToggle} onReview={onReview} onDelete={onDelete} onMove={onMove} />
              ))}
            </FolderSection>
          ))
        : folder.documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} isExpanded={expandedId === doc.id} onToggle={onToggle} onReview={onReview} onDelete={onDelete} onMove={onMove} />
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
          className="min-w-0 flex-1 text-base bg-paper border border-ink/15 rounded-md px-2 py-1.5"
        />
        {!isQualitative && (
          <input
            type="text"
            value={row.unit ?? ""}
            onChange={(e) => onChange({ unit: e.target.value })}
            placeholder="ед."
            className="w-16 shrink-0 text-base bg-paper border border-ink/15 rounded-md px-2 py-1.5"
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
        className="w-full text-base bg-paper border border-ink/15 rounded-md px-2 py-1.5 mb-2"
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
          className="min-w-0 flex-1 text-base bg-paper border border-ink/15 rounded-md px-2 py-1.5"
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

function MoveDocumentPanel({ doc, onClose, onMove }) {
  const [query, setQuery] = useState("");
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");

  const targets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MOVE_TARGETS.filter((t) => t.value !== doc.folder && (!q || t.label.toLowerCase().includes(q)));
  }, [query, doc.folder]);

  async function handlePick(target) {
    setMoving(true);
    setError("");
    try {
      await onMove(doc.id, target.value);
    } catch (err) {
      setError(err.message);
      setMoving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="bg-paper w-full max-w-md rounded-lg max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-display font-light tracking-tight text-xl">Перенести документ</p>
          <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink text-sm">
            закрыть
          </button>
        </div>
        <p className="text-xs text-ink/50 mb-4 truncate">{documentTitle(doc)}</p>

        <input
          autoFocus
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск папки…"
          className="w-full text-base bg-surface border border-ink/15 rounded-md px-2 py-1.5 mb-2"
        />

        {error && <p className="text-sm text-danger mb-2">{error}</p>}

        <div className="space-y-0.5">
          {targets.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handlePick(t)}
              disabled={moving}
              className="w-full text-left text-sm px-3 py-2 rounded-md hover:bg-surface disabled:opacity-50 transition-colors"
            >
              {t.label}
            </button>
          ))}
          {targets.length === 0 && <p className="text-sm text-ink/40 px-3 py-2">Ничего не найдено</p>}
        </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="bg-paper w-full max-w-md rounded-lg max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="font-display font-light tracking-tight text-xl">Проверьте показатели</p>
          <button type="button" onClick={onClose} className="text-ink/40 hover:text-ink text-sm">
            закрыть
          </button>
        </div>
        <p className="text-xs text-ink/50 mb-4">{docData && documentTitle(docData.document)}</p>

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

// Notification card shown while a document is uploading/processing, and
// after — with what got recognized — until dismissed. Persistent rather
// than an auto-dismissing toast: a failure especially shouldn't disappear
// before the user has read it.
function UploadStatus({ upload, onClose }) {
  if (!upload) return null;
  const pct = Math.round(upload.progress);
  const inProgress = upload.phase === "uploading" || upload.phase === "processing";

  return (
    <div className={`rounded-lg border p-4 mb-4 ${upload.phase === "error" ? "border-danger/30 bg-danger/5" : "border-ink/10 bg-surface"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{upload.file.name}</p>

          {inProgress && (
            <>
              <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden mt-2">
                <div className="h-full bg-moss transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-ink/50 mt-1.5">
                {upload.phase === "uploading" ? "загружаем" : "распознаём"} · {pct}%
              </p>
            </>
          )}

          {upload.phase === "done" && (
            <p className="text-xs text-ink/60 mt-1">
              Распознан как «{documentTitle(upload.doc)}», сохранён в папке «{folderPathLabel(upload.doc.folder) || upload.folderLabel}».
            </p>
          )}

          {upload.phase === "error" && (
            <p className="text-xs text-danger mt-1">
              {upload.documentId
                ? "Не удалось обработать документ. Файл сохранён — можно открыть оригинал в списке ниже."
                : upload.message || "Не удалось загрузить документ."}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 text-xs text-ink/40 hover:text-ink">
          закрыть
        </button>
      </div>
    </div>
  );
}

export default function Documents() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [openFolderLabel, setOpenFolderLabel] = useState(null);
  const [reviewDocId, setReviewDocId] = useState(null);
  const [moveDocId, setMoveDocId] = useState(null);
  // Tracks the single most recent upload for the progress/result banner —
  // starting a new upload while a previous one is still processing simply
  // replaces it; there's no queue.
  const [activeUpload, setActiveUpload] = useState(null);

  // SWR's dynamic `refreshInterval: (data) => ...` only re-evaluates from
  // inside its own poll loop — it decides whether to schedule the *next*
  // tick based on data at the time of the *current* tick. If no tick is
  // running yet (interval was 0 the last time one got scheduled, e.g. at
  // mount, before any document existed), nothing will ever restart it —
  // there's no independent signal telling SWR "check again, something
  // changed". A plain value sidesteps that entirely: React's own effect-dep
  // comparison restarts the poll the moment this flips 0 → non-zero (upload
  // begins) and stops it on non-zero → 0 (done/failed), while staying
  // byte-identical across unrelated re-renders (e.g. the progress easer's
  // 400ms ticks below) so it isn't torn down and restarted for no reason.
  const { data: docRes, mutate: mutateDocuments } = useSWR("documents", () => api.listDocuments(), {
    refreshInterval: activeUpload?.phase === "processing" ? 2000 : 0,
  });
  const documents = docRes?.documents ?? [];

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Once the byte transfer finishes there's no further signal from the
  // server until the next document-list poll (OCR + AI classification give
  // no intermediate progress events) — ease the bar toward
  // PROCESSING_CEILING so it doesn't look stalled while that's in flight.
  useEffect(() => {
    if (activeUpload?.phase !== "processing") return;
    const interval = setInterval(() => {
      setActiveUpload((prev) => {
        if (!prev || prev.phase !== "processing") return prev;
        return { ...prev, progress: prev.progress + (PROCESSING_CEILING - prev.progress) * 0.15 };
      });
    }, 400);
    return () => clearInterval(interval);
  }, [activeUpload?.phase]);

  // Watches the polled document list for the tracked upload's document
  // flipping to parsed/failed — that's the actual "100%" signal, driven by
  // the same refreshInterval that already polls while any doc is processing.
  useEffect(() => {
    if (!activeUpload?.documentId || activeUpload.phase !== "processing") return;
    const doc = documents.find((d) => d.id === activeUpload.documentId);
    if (!doc) return;
    if (doc.status === "parsed") {
      setActiveUpload((prev) => (prev?.documentId === doc.id ? { ...prev, phase: "done", progress: 100, doc } : prev));
    } else if (doc.status === "failed") {
      setActiveUpload((prev) => (prev?.documentId === doc.id ? { ...prev, phase: "error", doc } : prev));
    }
  }, [documents, activeUpload?.documentId, activeUpload?.phase]);

  // folderLabel передаётся при загрузке через «+» на карточке папки с
  // главной страницы раздела; внутри открытой папки берётся её label.
  async function handleUpload(file, folderLabel = openFolderLabel) {
    setUploading(true);
    setError("");
    // Загрузка с карточки сразу открывает папку — там виден статус
    // «загружаем…» и появившийся документ, а не тихая фоновая работа.
    if (folderLabel !== openFolderLabel) setOpenFolderLabel(folderLabel);
    setActiveUpload({ file, folderLabel, phase: "uploading", progress: 2, documentId: null });
    try {
      const { document } = await api.uploadDocument(file, folderLabel, (fraction) => {
        setActiveUpload((prev) =>
          prev && prev.phase === "uploading" ? { ...prev, progress: Math.max(2, fraction * UPLOAD_CEILING) } : prev
        );
      });
      setActiveUpload((prev) =>
        prev ? { ...prev, phase: "processing", progress: UPLOAD_CEILING, documentId: document.id } : prev
      );
      await mutateDocuments();
    } catch (err) {
      // Failed before the server even accepted the file (network, folder
      // validation) — no documentId yet, so this can't come from the
      // processing-poll effect above. Surfaced via the banner itself rather
      // than the generic `error` paragraph, since it's right where the
      // upload was started.
      setActiveUpload((prev) => (prev ? { ...prev, phase: "error", message: err.message } : prev));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await api.deleteDocument(id);
      setExpandedId(null);
      await mutateDocuments();
    } catch (err) {
      setError(err.message);
    }
  }

  // Doesn't catch — MoveDocumentPanel awaits this itself so it can show the
  // error inline and stay open, instead of the panel silently closing on a
  // failed move.
  async function handleMove(id, folder) {
    await api.moveDocument(id, folder);
    setExpandedId(null);
    setMoveDocId(null);
    await mutateDocuments();
  }

  const folders = groupDocumentsByFolder(documents);
  const openFolder = folders.find((f) => f.label === openFolderLabel);

  return (
    <div>
      <UploadStatus upload={activeUpload} onClose={() => setActiveUpload(null)} />
      {!openFolder ? (
        <>
          <p className="font-display font-light tracking-tight text-3xl mb-1">Документы</p>
          <p className="text-ink/60 mb-6">Загружайте анализы, выписки и снимки — мы распознаем и структурируем их</p>
          <div className="grid grid-cols-2 gap-3">
            {folders.map((f) => (
              <FolderCard key={f.label} label={f.label} count={f.count} onClick={() => setOpenFolderLabel(f.label)} onUpload={handleUpload} />
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
          onDelete={handleDelete}
          onMove={setMoveDocId}
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

      {moveDocId && documents.find((d) => d.id === moveDocId) && (
        <MoveDocumentPanel
          doc={documents.find((d) => d.id === moveDocId)}
          onClose={() => setMoveDocId(null)}
          onMove={handleMove}
        />
      )}
    </div>
  );
}
