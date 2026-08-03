-- AIGC Creative Studio local PostgreSQL schema.
-- Apply with: psql -U aigc -d aigc_studio -f sql/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS generation_tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  aspect_ratio VARCHAR(5) NOT NULL CHECK (aspect_ratio IN ('1:1', '4:3', '3:4', '16:9')),
  image_count SMALLINT NOT NULL CHECK (image_count IN (1, 2, 4)),
  seed INTEGER CHECK (seed BETWEEN 0 AND 2147483647),
  style VARCHAR(20) NOT NULL CHECK (style IN ('realistic', 'anime', 'cyberpunk', 'watercolor')),
  provider VARCHAR(100),
  provider_task_id VARCHAR(255),
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS generation_tasks_user_created_at_index
  ON generation_tasks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('generated', 'edited', 'imported')),
  storage_key TEXT NOT NULL,
  original_file_name VARCHAR(255),
  mime_type VARCHAR(100) NOT NULL,
  byte_size BIGINT,
  source_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe for an existing local database created before stable image ordering.
ALTER TABLE images ADD COLUMN IF NOT EXISTS position INTEGER;
WITH ordered_images AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY generation_task_id
    ORDER BY created_at ASC, id ASC
  ) - 1 AS image_position
  FROM images
  WHERE position IS NULL
)
UPDATE images
SET position = ordered_images.image_position
FROM ordered_images
WHERE images.id = ordered_images.id;
ALTER TABLE images ALTER COLUMN position SET DEFAULT 0;
ALTER TABLE images ALTER COLUMN position SET NOT NULL;

CREATE INDEX IF NOT EXISTS images_user_created_at_index
  ON images (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS images_generation_task_index
  ON images (generation_task_id);

CREATE UNIQUE INDEX IF NOT EXISTS images_generation_task_position_index
  ON images (generation_task_id, position);
