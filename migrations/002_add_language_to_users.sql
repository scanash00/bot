ALTER TABLE users 
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);
