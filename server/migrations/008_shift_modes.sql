-- Migracja 8: tryby pracy w grafiku (wydłużona, nieregularna, dodatkowa / nadgodziny) i zamiany zmian.
ALTER TABLE schedule_entries ADD COLUMN mode TEXT NOT NULL DEFAULT 'standardowa' CHECK (mode IN ('standardowa','wydluzona','nieregularna','dodatkowa'));
ALTER TABLE schedule_entries ADD COLUMN overtime_min INTEGER NOT NULL DEFAULT 0;   -- minuty ponad normę dobową (dzień dodatkowy = cała zmiana)
ALTER TABLE schedule_entries ADD COLUMN reason TEXT;                                -- powód zmiany trybu / dnia dodatkowego (np. braki kadrowe)
ALTER TABLE schedule_entries ADD COLUMN updated_at TEXT;
