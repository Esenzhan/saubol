-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Загруженные документы (анализы, выписки, снимки)
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  document_type TEXT, -- 'lab_result' | 'prescription' | 'imaging' | 'other'
  status TEXT DEFAULT 'processing', -- processing | parsed | failed
  raw_text TEXT, -- текст после OCR
  document_date DATE, -- дата анализа/приёма, извлечённая из документа
  display_name TEXT, -- человекочитаемое имя ('Общий анализ крови от 22.08.2025'), генерируется автоматически
  folder TEXT, -- папка на странице «Документы» ('Общий анализ крови (ОАК)', 'Генетика', ...)
  file_data BYTEA, -- байты самого файла — Render не даёт постоянного диска, поэтому храним в БД
  mime_type TEXT, -- 'application/pdf' | 'image/png' | 'image/jpeg'
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS folder TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- Извлечённые биомаркеры/показатели из документов
CREATE TABLE IF NOT EXISTS biomarkers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,        -- напр. 'Гемоглобин'
  value NUMERIC,             -- числовой результат, если применимо
  value_text TEXT,           -- качественный результат ('не обнаружено', 'светло-жёлтый') — заполняется когда value NULL
  unit TEXT,                 -- напр. 'г/л'
  ref_range_low NUMERIC,
  ref_range_high NUMERIC,
  measured_at DATE,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false, -- похоже на ошибку OCR/распознавания — см. isImplausibleValue в ai.js
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE biomarkers ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE biomarkers ADD COLUMN IF NOT EXISTS value_text TEXT;

-- Разделы медкарты (диагнозы, лекарства, рекомендации)
CREATE TABLE IF NOT EXISTS medcard_entries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  section TEXT NOT NULL,     -- 'diagnosis' | 'medication' | 'recommendation' | 'allergy'
  title TEXT NOT NULL,
  details TEXT,
  entry_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- История AI-чата
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,        -- 'user' | 'assistant'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_biomarkers_user_name ON biomarkers(user_id, name);
CREATE INDEX IF NOT EXISTS idx_medcard_user ON medcard_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, created_at);
