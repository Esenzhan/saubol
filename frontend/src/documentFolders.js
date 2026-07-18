// Folder tree for the Документы page. Leaf names must match backend/services/ai.js's
// FOLDERS list exactly — that's where `folder` gets set on upload.
const ANALYSIS_SUBFOLDERS = [
  "Общий анализ крови (ОАК)",
  "Биохимия крови",
  "Витамины и микроэлементы",
  "Иммунология / Аллергология",
  "Общий анализ мочи (ОАМ)",
  "Паразитология и инфекции",
  "Комплексные анализы",
];

export const FOLDER_TREE = [
  { label: "Анализы", children: ANALYSIS_SUBFOLDERS },
  { label: "Генетика", children: null },
  { label: "Выписки и заключения", children: null },
  { label: "Дневник наблюдений", children: null },
];

const OTHER_LABEL = "Другое";

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

// Groups a flat document list into the tree above, newest-first at every
// level: subfolders within "Анализы" are ordered by their own most recent
// document, and the top-level folders are ordered by the most recent
// document anywhere inside them. Top-level entries without children get
// their documents directly; anything with an unrecognized/missing folder
// falls into "Другое", always last regardless of date.
export function groupDocumentsByFolder(documents) {
  const byFolder = new Map();
  for (const doc of documents) {
    const key = doc.folder || OTHER_LABEL;
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(doc);
  }

  const byRecency = (a, b) => (latestDate(b.documents ?? b.subfolders.flatMap((s) => s.documents)) || "").localeCompare(
    latestDate(a.documents ?? a.subfolders.flatMap((s) => s.documents)) || ""
  );

  const result = [];
  for (const node of FOLDER_TREE) {
    if (node.children) {
      const subfolders = node.children
        .filter((label) => byFolder.has(label))
        .map((label) => ({ label, documents: byFolder.get(label) }))
        .sort((a, b) => (latestDate(b.documents) || "").localeCompare(latestDate(a.documents) || ""));
      const count = subfolders.reduce((sum, s) => sum + s.documents.length, 0);
      if (count > 0) result.push({ label: node.label, subfolders, count });
    } else if (byFolder.has(node.label)) {
      result.push({ label: node.label, documents: byFolder.get(node.label), count: byFolder.get(node.label).length });
    }
  }
  result.sort(byRecency);

  if (byFolder.has(OTHER_LABEL)) {
    const docs = byFolder.get(OTHER_LABEL);
    result.push({ label: OTHER_LABEL, documents: docs, count: docs.length });
  }
  return result;
}
