-- hukuk-mcp compiled corpus — SQLite (query path) / mirrors the Postgres build schema.
-- All *_kok columns hold ASCII-folded, stemmed keys produced by @hukuk/tr-text.
-- All content columns hold the human-readable Turkish text.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- ------------------------------ legislation ------------------------------

CREATE TABLE IF NOT EXISTS mevzuat (
  id           TEXT PRIMARY KEY,          -- '6502'
  tur          TEXT NOT NULL,             -- kanun | yonetmelik | teblig | cbk
  ad           TEXT NOT NULL,
  kabul_tarihi TEXT,
  rg_tarih     TEXT,
  rg_sayi      INTEGER,
  kaynak_url   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS madde (
  id           TEXT PRIMARY KEY,          -- 'm:6502/11'
  mevzuat_id   TEXT NOT NULL REFERENCES mevzuat(id),
  madde_no     TEXT NOT NULL,             -- '11'
  baslik       TEXT,
  metin        TEXT NOT NULL,
  degisiklik   TEXT,                      -- '(Değişik: 16/7/2026-7589/10 md.)'
  kaynak_url   TEXT NOT NULL,
  token_l1     INTEGER NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS madde_fts USING fts5(
  madde_id UNINDEXED,
  baslik,
  metin,
  kok,
  tokenize = 'unicode61 remove_diacritics 0'
);

-- ------------------------------ decisions ------------------------------

CREATE TABLE IF NOT EXISTS karar (
  id           TEXT PRIMARY KEY,          -- 'k:ygt-13hd-2013-7601-2013-16449'
  mahkeme      TEXT NOT NULL,             -- yargitay | bam | ilkderece
  daire        TEXT,
  esas         TEXT,
  karar_no     TEXT,
  tarih        TEXT NOT NULL,             -- ISO
  kesinlesme   TEXT NOT NULL DEFAULT 'bilinmiyor',
  agirlik      INTEGER NOT NULL,          -- 0-100 bindingness
  kaynak_url   TEXT NOT NULL,
  ozet_l0      TEXT,
  ozet_l1      TEXT,
  token_l0     INTEGER,
  token_l1     INTEGER,
  dugum_id     TEXT,
  sonuc        TEXT,                      -- kabul | kismen | ret | bozma | onama | diger
  tam_metin_key TEXT
);

CREATE INDEX IF NOT EXISTS idx_karar_tarih ON karar(tarih);
CREATE INDEX IF NOT EXISTS idx_karar_dugum ON karar(dugum_id);

CREATE VIRTUAL TABLE IF NOT EXISTS karar_fts USING fts5(
  karar_id UNINDEXED,
  kok,
  tokenize = 'unicode61 remove_diacritics 0'
);

-- ------------------------------ ontology ------------------------------

CREATE TABLE IF NOT EXISTS dugum (
  id             TEXT PRIMARY KEY,        -- 't/ayipli-mal/arac/gizli-ayip/bedel-iadesi'
  ust_id         TEXT,
  ad             TEXT NOT NULL,
  aciklama       TEXT,
  tetikleyiciler TEXT NOT NULL,           -- JSON array
  ornek_sorgular TEXT NOT NULL,           -- JSON array
  kurallar       TEXT NOT NULL,           -- JSON array
  maddeler       TEXT NOT NULL,           -- JSON array
  sira           INTEGER,
  vektor         TEXT                     -- JSON char-3gram vector
);

CREATE INDEX IF NOT EXISTS idx_dugum_ust ON dugum(ust_id);

-- ------------------------------ cards ------------------------------

CREATE TABLE IF NOT EXISTS kart (
  dugum_id        TEXT PRIMARY KEY REFERENCES dugum(id),
  surum           INTEGER NOT NULL,
  durum           TEXT NOT NULL,          -- taslak | otomatik | uzman_onayli | eskimis
  icerik          TEXT NOT NULL,          -- JSON Kart
  bolum_tokenlari TEXT NOT NULL,          -- JSON {etiket: token}
  girdi_hash      TEXT NOT NULL,
  token           INTEGER NOT NULL,
  onaylayan       TEXT,
  onay_zamani     TEXT,
  guncelleme      TEXT NOT NULL
);

-- ------------------------------ arguments ------------------------------

CREATE TABLE IF NOT EXISTS arguman (
  id        TEXT PRIMARY KEY,
  dugum_id  TEXT NOT NULL,
  taraf     TEXT NOT NULL,
  iddia     TEXT NOT NULL,
  kabul     INTEGER NOT NULL DEFAULT 0,
  ret       INTEGER NOT NULL DEFAULT 0,
  belirleyici TEXT
);

-- ------------------------------ rule parameters ------------------------------

CREATE TABLE IF NOT EXISTS kural_parametre (
  kural_id        TEXT NOT NULL,
  anahtar         TEXT NOT NULL,
  deger           TEXT NOT NULL,          -- JSON scalar or object
  gecerlilik_bas  TEXT NOT NULL,
  gecerlilik_bit  TEXT,
  kaynak_url      TEXT NOT NULL,
  durum           TEXT NOT NULL,          -- teyit_bekliyor | uzman_onayli
  PRIMARY KEY (kural_id, anahtar, gecerlilik_bas)
);

-- ------------------------------ citations ------------------------------

CREATE TABLE IF NOT EXISTS atif (
  kaynak_id  TEXT NOT NULL,
  hedef_id   TEXT NOT NULL,
  tur        TEXT NOT NULL,               -- karar->madde, karar->karar
  PRIMARY KEY (kaynak_id, hedef_id, tur)
);

CREATE INDEX IF NOT EXISTS idx_atif_hedef ON atif(hedef_id);

-- Madde değişiklik notları: `degisiklik` sütunundan ve metin içi "(Değişik: ...)" notlarından.
CREATE TABLE IF NOT EXISTS madde_degisiklik (
  madde_id     TEXT NOT NULL,             -- madde.id
  fikra        INTEGER,                   -- not "(n)" fıkrasına aitse n, değilse NULL (madde geneli)
  tur          TEXT NOT NULL,             -- degisik | ek | mulga | iptal | aynen_kabul | diger
  tarih        TEXT NOT NULL,             -- ISO YYYY-MM-DD
  kanun_no     TEXT,                      -- '7392', 'KHK-684'; iptalde NULL
  kanun_madde  TEXT,                      -- değiştiren kanunun madde numarası
  ham          TEXT NOT NULL              -- notun özgün metni
);
CREATE INDEX IF NOT EXISTS idx_madde_degisiklik_madde ON madde_degisiklik (madde_id);
