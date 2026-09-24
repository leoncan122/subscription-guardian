-- User profile / view configuration: extends the (previously unused)
-- user_settings table from 001 instead of adding an overlapping one.
-- `currency` is now the user's base currency for totals.
-- Run in Supabase Dashboard → SQL Editor

ALTER TABLE user_settings
    ADD COLUMN IF NOT EXISTS country TEXT,               -- ISO 3166-1 alpha-2, e.g. 'ES'
    ADD COLUMN IF NOT EXISTS locale TEXT,                -- BCP 47, e.g. 'es-ES'
    ADD COLUMN IF NOT EXISTS timezone TEXT,              -- IANA, e.g. 'Europe/Madrid'
    ADD COLUMN IF NOT EXISTS payday SMALLINT
        CHECK (payday IS NULL OR payday BETWEEN 1 AND 31),
    ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMP WITH TIME ZONE;

-- 001 created SELECT/INSERT/UPDATE policies; re-create them idempotently in
-- case 001 was only partially applied.
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own settings" ON user_settings;
CREATE POLICY "Users can view own settings"
    ON user_settings FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own settings" ON user_settings;
CREATE POLICY "Users can insert own settings"
    ON user_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own settings" ON user_settings;
CREATE POLICY "Users can update own settings"
    ON user_settings FOR UPDATE
    USING (auth.uid() = user_id);
