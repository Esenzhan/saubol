// The AI is inconsistent about which alphabet it uses for a handful of
// letters that look identical in Cyrillic and Latin (Cyrillic "Е" vs Latin
// "E" is the one that's actually bitten us — "Иммуноглобулин Е" vs
// "Иммуноглобулин E" showed up as two separate rows in the medcard's
// biomarker list, splitting one biomarker's history in two). This map lets
// two such spellings compare equal without touching the display text.
const CYRILLIC_TO_LATIN_HOMOGLYPHS = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x",
};

export function normalizeForComparison(name) {
  return name
    .split("")
    .map((ch) => CYRILLIC_TO_LATIN_HOMOGLYPHS[ch] || ch)
    .join("")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Maps a freshly extracted biomarker name onto whichever spelling this
 * user's history already established, when the two differ only by a
 * Cyrillic/Latin look-alike letter or casing/whitespace. Keeps the
 * medcard's per-name history (and its chart) from silently splitting in
 * two the next time the model picks the other alphabet for the same
 * letter. Returns the name unchanged the first time a biomarker is seen.
 */
export function canonicalizeBiomarkerName(rawName, existingNames) {
  const key = normalizeForComparison(rawName);
  const match = existingNames.find((n) => normalizeForComparison(n) === key);
  return match || rawName;
}
