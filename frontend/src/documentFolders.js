// Folder tree for the Документы page. "Анализы" is the only folder with
// subfolders — its 7 leaf names must match backend/services/ai.js's FOLDERS
// list exactly, that's where the AI classifies documents into one of them.
// The other 3 top-level folders are flat and chosen directly by the user at
// upload time (see documents.js on the backend) — nothing classifies them.
const ANALYSIS_SUBFOLDERS = [
  "Общий анализ крови (ОАК)",
  "Биохимия крови",
  "Витамины и микроэлементы",
  "Иммунология / Аллергология",
  "Общий анализ мочи (ОАМ)",
  "Паразитология и инфекции",
  "Комплексные анализы",
];

// A document's stored `folder` value is either a top-level label (chosen by
// the user at upload time, for the 3 flat folders) or an Анализы subfolder
// (assigned by the AI classifier after processing) — never the literal
// string "Анализы" itself. This turns that raw value into the full path a
// human would expect to see, for the post-upload notification.
export function folderPathLabel(folderValue) {
  if (!folderValue) return null;
  return ANALYSIS_SUBFOLDERS.includes(folderValue) ? `Анализы → ${folderValue}` : folderValue;
}

export const FOLDER_TREE = [
  { label: "Анализы", children: ANALYSIS_SUBFOLDERS },
  { label: "Приёмы врачей", children: null },
  { label: "Выписки и заключения", children: null },
  { label: "Другое", children: null },
];

// Every place a document can be moved to: the 3 flat folders as-is, plus
// each Анализы subfolder individually (never the bare "Анализы" label —
// documents live in one of its subfolders, not directly in the group).
// `value` is what's stored in `documents.folder`; `label` is what a picker
// shows, reusing the same "Анализы → X" phrasing as folderPathLabel above.
export const MOVE_TARGETS = FOLDER_TREE.flatMap((node) =>
  node.children
    ? node.children.map((sub) => ({ value: sub, label: `${node.label} → ${sub}` }))
    : [{ value: node.label, label: node.label }]
);

const OTHER_LABEL = "Другое";

// Icon + accent colour for each top-level folder card. Colours reuse the
// existing theme tokens (accent/pending/danger, plus a neutral ink tone for
// "Другое") so the cards stay theme-aware without introducing new hues.
export const FOLDER_META = {
  "Анализы": {
    hue: "accent",
    icon: '<path d="M9 3h6M10 3v6.2l-5 8.6A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-3.2l-5-8.6V3"/>',
  },
  "Приёмы врачей": {
    hue: "pending",
    icon: '<path d="M5 3v6a4 4 0 0 0 8 0V3"/><circle cx="17" cy="16" r="3"/><path d="M13 8v2a5 5 0 0 0 4 4.9"/>',
  },
  "Выписки и заключения": {
    hue: "danger",
    icon: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  },
  [OTHER_LABEL]: {
    hue: "ink",
    icon: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  },
};

// Only document_date counts here — created_at is when the file was
// uploaded/imported, not when the medical event happened, and using it as a
// fallback made undated documents (e.g. a WGS report backfilled in bulk)
// look like the "most recent" thing in the whole account. A folder with no
// dated documents in it just sorts last, which is the right default.
function latestDate(docs) {
  let latest = null;
  for (const doc of docs) {
    if (doc.document_date && (!latest || doc.document_date > latest)) latest = doc.document_date;
  }
  return latest;
}

const KNOWN_LABELS = new Set(FOLDER_TREE.flatMap((n) => (n.children ? n.children : [n.label])));

// Groups a flat document list into the tree above. Always returns all 4
// top-level folders in the fixed order defined above (even with 0
// documents) — the Документы page renders them as a static 2x2 grid, not a
// list that appears/disappears as documents come and go. Only the
// subfolders within "Анализы" are sorted, newest document first. Anything
// with a missing or unrecognized folder value (including retired legacy
// folders) falls into "Другое" rather than silently vanishing.
export function groupDocumentsByFolder(documents) {
  const byFolder = new Map();
  for (const doc of documents) {
    const key = KNOWN_LABELS.has(doc.folder) ? doc.folder : OTHER_LABEL;
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(doc);
  }

  return FOLDER_TREE.map((node) => {
    if (node.children) {
      const subfolders = node.children
        .filter((label) => byFolder.has(label))
        .map((label) => ({ label, documents: byFolder.get(label) }))
        .sort((a, b) => (latestDate(b.documents) || "").localeCompare(latestDate(a.documents) || ""));
      const count = subfolders.reduce((sum, s) => sum + s.documents.length, 0);
      return { label: node.label, subfolders, count };
    }
    const docs = byFolder.get(node.label) || [];
    return { label: node.label, documents: docs, count: docs.length };
  });
}
