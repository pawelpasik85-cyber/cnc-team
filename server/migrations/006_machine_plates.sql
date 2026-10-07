-- Migracja 6: dane z tabliczek znamionowych maszyn i typ oprawek narzędziowych (od kierownika, 7.10.2026).
ALTER TABLE machines ADD COLUMN tool_holder TEXT;
ALTER TABLE machines ADD COLUMN plate TEXT;   -- dane z tabliczki (tekst), np. zasilanie, moc, masa
-- Uzupełnienie tylko tam, gdzie kierownik nie wpisał jeszcze modelu
UPDATE machines SET model = 'HCMC-18', tool_holder = 'BT50',
  plate = 'Zasilanie 380/415 V, 3 fazy, 50/60 Hz · moc 45 kVA · powietrze 6,5 kg/cm² (92 psi) · masa 16 000 kg',
  notes = CASE WHEN notes = 'Dokładny model do uzupełnienia' THEN NULL ELSE notes END
  WHERE id = 'M-HARTFORD' AND model IS NULL;
UPDATE machines SET model = 'PSF-M 25/17', tool_holder = 'HSK40',
  plate = 'Grimme SysTech · nr ser. 870 · rok 2013 · wrzeciono Classic 120 · napęd Siemens (SIE/HD), serwo · 230/400 V, 50 Hz · 30,2 kW',
  notes = CASE WHEN notes = 'Dokładny model do uzupełnienia' THEN NULL ELSE notes END
  WHERE id = 'M-GRIMME' AND model IS NULL;
