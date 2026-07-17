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

// Groups a flat document list into the tree above. Top-level entries without
// children get their documents directly; "Анализы" gets a nested map of its
// subfolders. Anything with an unrecognized/missing folder falls into "Другое".
export function groupDocumentsByFolder(documents) {
  const byFolder = new Map();
  for (const doc of documents) {
    const key = doc.folder || OTHER_LABEL;
    if (!byFolder.has(key)) byFolder.set(key, []);
    byFolder.get(key).push(doc);
  }

  const result = [];
  for (const node of FOLDER_TREE) {
    if (node.children) {
      const subfolders = node.children
        .filter((label) => byFolder.has(label))
        .map((label) => ({ label, documents: byFolder.get(label) }));
      const count = subfolders.reduce((sum, s) => sum + s.documents.length, 0);
      if (count > 0) result.push({ label: node.label, subfolders, count });
    } else if (byFolder.has(node.label)) {
      result.push({ label: node.label, documents: byFolder.get(node.label), count: byFolder.get(node.label).length });
    }
  }
  if (byFolder.has(OTHER_LABEL)) {
    result.push({ label: OTHER_LABEL, documents: byFolder.get(OTHER_LABEL), count: byFolder.get(OTHER_LABEL).length });
  }
  return result;
}
