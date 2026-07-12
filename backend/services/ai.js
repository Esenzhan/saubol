import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

/**
 * Извлекает структурированные биомаркеры из сырого текста документа (после OCR).
 * Возвращает массив { name, value, unit, ref_range_low, ref_range_high, measured_at }.
 */
export async function extractBiomarkers(rawText) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system:
      "Ты извлекаешь медицинские показатели из текста лабораторного анализа. " +
      "Отвечай ТОЛЬКО валидным JSON-массивом объектов вида " +
      '{"name": string, "value": number, "unit": string, "ref_range_low": number|null, "ref_range_high": number|null, "measured_at": string|null}. ' +
      "Никакого текста до или после JSON. Если показателей нет — верни [].",
    messages: [{ role: "user", content: rawText.slice(0, 12000) }],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  try {
    return JSON.parse(text.trim().replace(/^```json|```$/g, ""));
  } catch (err) {
    console.error("Не удалось распарсить ответ модели как JSON:", text);
    return [];
  }
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
