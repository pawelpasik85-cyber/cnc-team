-- Rozdzielenie „gwintownik / frez do gwintów”: dotychczasowe gwintowniki z liczbą ostrzy to frezy do gwintów
UPDATE tools SET params = json_set(params, '$.type', 'frez-gwintowy')
 WHERE kind = 'frez' AND json_extract(params, '$.type') = 'gwintownik' AND json_extract(params, '$.z') IS NOT NULL;
