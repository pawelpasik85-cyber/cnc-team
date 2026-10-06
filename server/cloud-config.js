'use strict';
// Chmura dla aplikacji pracowników: Supabase, projekt „cnc-team” (Frankfurt).
// Klucz poniżej to klucz PUBLIKOWALNY — jest przeznaczony do umieszczenia w aplikacjach i sam niczego
// nie udostępnia. O dostępie do danych decyduje logowanie i reguły RLS (supabase/*.sql).
// Można nadpisać zmiennymi CNC_CLOUD_URL / CNC_CLOUD_KEY (np. w testach).
module.exports = {
  url: process.env.CNC_CLOUD_URL || 'https://nizyupcbbdljbysruxdu.supabase.co',
  key: process.env.CNC_CLOUD_KEY || 'sb_publishable_mnYZc4KRYI7bBGC6uaOgNg_dvpxYTOJ',
};
