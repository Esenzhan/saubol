// Two dates matter for a document: the date printed on the lab report
// itself (document_date), and the date it was added to the site
// (created_at). The title is just the bare content description
// ("Общий анализ крови") — the upload date is deliberately NOT part of it:
// it's secondary information, shown only inside the expanded details via
// documentUploadDate(). The date users actually care about is the one on
// the document itself, shown greyed-out under the title.
export function documentTitle(doc) {
  return doc.display_name || doc.original_filename;
}

// The secondary, greyed-out date shown under a document's title — the date
// printed on the document itself, falling back to the upload date only for
// documents where no date could be read off the original (e.g. classification
// failed, or the document doesn't carry one).
export function documentSecondaryDate(doc) {
  return doc.document_date ? formatCalendarDate(doc.document_date) : formatDate(doc.created_at);
}

// Upload date for the expanded details view ("Загружен 19.07.2026").
export function documentUploadDate(doc) {
  return formatDate(doc.created_at);
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
