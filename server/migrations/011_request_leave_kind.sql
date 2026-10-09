-- Zgłoszenie nieobecności: o jaki rodzaj urlopu / nieobecności prosi programista (decyzja i wpis — tylko kierownik)
ALTER TABLE requests ADD COLUMN wanted_code TEXT;
