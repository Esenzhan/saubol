// Two dates matter for a document: the date printed on the lab report
// itself (document_date), and the date it was added to the site
// (created_at). display_name from the AI (or a manual import) is just the
// bare content description ("Общий анализ крови") — the "от <date>" suffix
// shown in the UI is always the upload date, appended here rather than
// baked into the stored name, so it can't drift out of sync with created_at.
export function documentTitle(doc) {
  if (!doc.display_name) return doc.original_filename;
  return `${doc.display_name} от ${formatDate(doc.created_at)}`;
}

// The secondary, greyed-out date shown under a document's title — the date
// printed on the document itself, falling back to the upload date only for
// documents where no date could be read off the original (e.g. classification
// failed, or the document doesn't carry one).
export function documentSecondaryDate(doc) {
  return doc.document_date ? formatCalendarDate(doc.document_date) : formatDate(doc.created_at);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("ru-RU");
}

// document_date is a plain "YYYY-MM-DD" calendar date (no time, no
// timezone) — reformat it directly rather than going through `new Date()`,
// which would reinterpret it in the viewer's timezone and can shift the day.
function formatCalendarDate(isoDate) {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}
