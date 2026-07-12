-- Пользователи
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Извлечённые биомаркеры/показатели из документов
CREATE TABLE IF NOT EXISTS biomarkers (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,        -- напр. 'Гемоглобин'
  value NUMERIC,
  unit TEXT,                 -- напр. 'г/л'
  ref_range_low NUMERIC,
  ref_range_high NUMERIC,
  measured_at DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

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
