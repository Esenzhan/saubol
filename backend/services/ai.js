import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Папки на странице «Документы». Первые 7 отображаются во фронтенде как
// подпапки «Анализы» (см. frontend/src/documentFolders.js) — держите оба
// списка в синхроне при изменении.
export const FOLDERS = [
  "Общий анализ крови (ОАК)",
  "Биохимия крови",
  "Витамины и микроэлементы",
  "Иммунология / Аллергология",
  "Общий анализ мочи (ОАМ)",
  "Паразитология и инфекции",
  "Комплексные анализы",
  "Генетика",
  "Выписки и заключения",
  "Дневник наблюдений",
  "Другое",
];

function toNumberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Отбрасывает мусор из ответа модели и приводит поля к ожидаемым типам.
 * Модель иногда возвращает не-массив, дубли текста вокруг JSON или строки
 * вместо чисел — ничего из этого не должно долетать до INSERT молча.
 */
function sanitizeBiomarkers(parsed) {
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const item of parsed) {
    if (!item || typeof item.name !== "string" || !item.name.trim()) continue;
    const value = toNumberOrNull(item.value);
    const valueText = typeof item.value_text === "string" && item.value_text.trim() ? item.value_text.trim() : null;
    // Every result matters, including qualitative ones ("не обнаружено") — a
    // row with neither a number nor a text reading isn't a real result, skip it.
    if (value === null && valueText === null) continue;
    out.push({
      name: item.name.trim(),
      value,
      value_text: value === null ? valueText : null,
      unit: typeof item.unit === "string" && item.unit.trim() ? item.unit.trim() : null,
      ref_range_low: toNumberOrNull(item.ref_range_low),
      ref_range_high: toNumberOrNull(item.ref_range_high),
      measured_at: typeof item.measured_at === "string" && DATE_RE.test(item.measured_at) ? item.measured_at : null,
    });
  }
  return out;
}

/**
 * Эвристика на правдоподобность значения — ловит характерный класс ошибок OCR,
 * когда десятичный разделитель "съедается" при распознавании скана
 * (напр. "43,2%" читается как "432%"). Не пытается угадать правильное значение,
 * только помечает подозрительные строки для проверки человеком — см.
 * [[saubol-resolved-issues]] в памяти проекта про этот же баг, пойманный вручную.
 */
export function isImplausibleValue(value, unit, refLow, refHigh) {
  if (value === null || value === undefined) return false; // qualitative result, nothing to sanity-check
  if (typeof unit === "string" && unit.includes("%") && value > 100) return true;
  if (refHigh !== null && refHigh > 0 && value > refHigh * 20) return true;
  if (refLow !== null && refLow > 0 && value < refLow / 20) return true;
  return false;
}

function sanitizeClassification(parsed) {
  const displayName =
    typeof parsed?.display_name === "string" && parsed.display_name.trim() ? parsed.display_name.trim() : null;
  const folder = FOLDERS.includes(parsed?.folder) ? parsed.folder : "Другое";
  const documentDate =
    typeof parsed?.document_date === "string" && DATE_RE.test(parsed.document_date) ? parsed.document_date : null;
  return { displayName, folder, documentDate };
}

/**
 * Извлекает биомаркеры и классифицирует документ (папка + человекочитаемое
 * название + дата для сортировки) одним запросом к модели — экономит токены
 * по сравнению с несколькими отдельными вызовами.
 * Возвращает { displayName, folder, documentDate, biomarkers: [...] }.
 */
export async function analyzeDocument(rawText) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system:
      "Ты анализируешь текст медицинского документа, полученный через OCR, и делаешь две вещи.\n\n" +
      "1) Классифицируешь документ: display_name — короткое человекочитаемое название вида " +
      '"Общий анализ крови от 22.08.2025" или "Выписка из истории болезни № 651 от 09.03.2011" ' +
      "(дату бери из бланка — дату регистрации заявки/забора биоматериала/поступления, а не дату печати бланка); " +
      "document_date — эта же дата в формате YYYY-MM-DD, отдельным полем (нужна для сортировки списка документов). " +
      "Если документ охватывает несколько дат (архив за период, дневник) — возьми самую позднюю дату из документа. " +
      'folder — ровно одно значение из списка: ' +
      FOLDERS.map((f) => `"${f}"`).join(", ") +
      '. Если в документе несколько разнородных панелей одного приёма (например, гормоны + ОАК + IgE) — folder ' +
      '= "Комплексные анализы", а в display_name перечисли основные типы через запятую в скобках, ' +
      'например "Комплексный анализ (гормоны, ОАК, IgE) от 20.02.2024". Для выписок/заключений — "Выписки и заключения". ' +
      'Для генетических отчётов (WGS и т.п.) — "Генетика". Если не уверен — "Другое".\n\n' +
      "2) Извлекаешь медицинские показатели из текста. Текст может содержать ошибки распознавания: " +
      "пропущенные десятичные разделители (запятая/точка), слипшиеся цифры. Читай значения в контексте: " +
      "если результат явно противоречит физическому смыслу (например, значение в процентах больше 100%) " +
      "или на порядок выходит за пределы указанного референсного диапазона без явной пометки об этом в тексте " +
      "— это, скорее всего, ошибка распознавания, а не реальный результат; в таком случае извлеки значение " +
      "ровно так, как оно написано в тексте (не пытайся самостоятельно восстановить точку), это будет " +
      "проверено отдельно. Извлекай КАЖДЫЙ результат в бланке, включая качественные (не только числовые): " +
      'если результат — текст вида "не обнаружено", "отрицательно", "прозрачная", "светло-жёлтый" и т.п., ' +
      "положи его в поле value_text, а value оставь null. Не пропускай строки только потому, что в них нет " +
      "числа — качественный отрицательный результат так же важен для истории болезни, как и числовой в норме.\n\n" +
      "Отвечай ТОЛЬКО валидным JSON-объектом вида " +
      '{"display_name": string, "document_date": string|null, "folder": string, "biomarkers": [{"name": string, "value": number|null, ' +
      '"value_text": string|null, "unit": string|null, "ref_range_low": number|null, "ref_range_high": number|null, ' +
      '"measured_at": string|null}]}. Ровно одно из value/value_text у каждого биомаркера должно быть заполнено. ' +
      "measured_at в формате YYYY-MM-DD. Никакого текста до или после JSON. Если показателей нет — biomarkers: [].",
    messages: [{ role: "user", content: rawText.slice(0, 12000) }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed;
  try {
    parsed = JSON.parse(text.trim().replace(/^```json|```$/g, ""));
  } catch (err) {
    console.error("Не удалось распарсить ответ модели как JSON:", text);
    return { displayName: null, folder: "Другое", documentDate: null, biomarkers: [] };
  }

  const { displayName, folder, documentDate } = sanitizeClassification(parsed);
  const biomarkers = sanitizeBiomarkers(parsed?.biomarkers).map((b) => ({
    ...b,
    flagged_for_review: isImplausibleValue(b.value, b.unit, b.ref_range_low, b.ref_range_high),
  }));

  return { displayName, folder, documentDate, biomarkers };
}

/**
 * AI-чат с ответами, основанными на документах и биомаркерах пользователя (упрощённый RAG).
 */
export async function chatWithContext({ question, biomarkers, medcardEntries, history }) {
  const context = [
    "Данные пользователя (только для справки, не диагностируй, рекомендуй обратиться к врачу при серьёзных вопросах):",
    "Показатели анализов:",
    JSON.stringify(biomarkers.slice(0, 100)),
    "Записи медкарты:",
    JSON.stringify(medcardEntries.slice(0, 50)),
  ].join("\n");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    system:
      "Ты — ассистент личной медкарты. Отвечай на вопросы пользователя, опираясь на предоставленные " +
      "данные его анализов и медкарты. Объясняй простым языком. Всегда уточняй, что ты не заменяешь врача, " +
      "и рекомендуй консультацию специалиста при тревожных показателях или серьёзных вопросах.\n\n" +
      context,
    messages: [...history, { role: "user", content: question }],
  });

  return response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}
