#!/usr/bin/env bash
# kabul-testi.sh — MCP sunucusunu uçtan uca sınayan kabul testi.
#
# Gerçek MCP stdio taşımasını kullanır (istemcinin yaptığının aynısı).
# Her senaryo bir davranış sözleşmesini doğrular; biri bozulursa çıkış kodu 1.
#
#   ./scripts/kabul-testi.sh                 # data/build/hukuk.db
#   HUKUK_DB=/yol/hukuk.db ./scripts/kabul-testi.sh
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0; FAILED=()
run() { node scripts/test-mcp.ts "$@" 2>&1; }

check() { # check <ad> <beklenen-alt-dize> <komut...>
  local ad="$1" beklenen="$2"; shift 2
  local out; out=$(run "$@")
  if grep -qF -- "$beklenen" <<<"$out"; then
    PASS=$((PASS+1)); printf '  ✔ %s\n' "$ad"
  else
    FAIL=$((FAIL+1)); FAILED+=("$ad")
    printf '  ✘ %s\n     beklenen: %s\n     gelen: %s\n' "$ad" "$beklenen" "$(head -2 <<<"$out" | tr '\n' ' ')"
  fi
}

echo "hukuk-mcp kabul testi · db=${HUKUK_DB:-data/build/hukuk.db}"
echo

check "araç ayıbı doğru düğüme gider"        "t/ayipli-mal/arac" \
  sor "Bayiden aldığım sıfır arabanın şanzımanı 3 ayda 4 kez arıza yaptı" --tutar 250000 --tarih 2026-06-01 --talep iade
check "sınır üstü tutar mahkemeye gider"     "tuketici_mahkemesi" \
  sor "Aracımın motoru iki ayda üç kez arıza yaptı, satıcı ilgilenmiyor" --tutar 250000 --tarih 2026-06-01
check "kısa/anlamsız soru netleştirme ister" "HANGİ KONU?" \
  sor "araba arızalı" --tutar 250000
check "kart aidatı doğru düğüme gider"       "t/finansal/kredi-karti-aidati" \
  sor "Kredi kartımdan yıllık aidat kesilmiş, iadesini istiyorum" --tutar 1200
check "sınır altı tutar hakem heyetine gider" "tuketici_hakem_heyeti" \
  sor "Kredi kartımdan yıllık aidat kesilmiş" --tutar 1200
check "ilgisiz anlatım reddedilir"           "DUGUM_BULUNAMADI" \
  sor "bir sorunum var ne yapmalıyım"
check "gerçek belirsizlik soru sorar"        "BELİRSİZ" \
  sor "ürün bozuk geldi parası iade edilmedi"
check "yakın ikinci konu adlandırılır"       "DİĞER OLASILIK" \
  sor "ürün gelmedi ve ücret iadesi yapılmıyor"
check "zamanaşımı hesaplanır"                "10.03.2027" \
  hesapla ayip_zamanasimi '{"teslim_tarihi":"2025-03-10"}'
check "arabuluculuk dava şartı bilinir"      "gerekli" \
  hesapla arabuluculuk_dava_sarti '{"uyusmazlik_degeri_tl":250000}'
check "madde kimliği çözümlenir"             "DOĞRU m:6502/11" \
  dogrula "m:6502/11"
check "uydurma karar kimliği reddedilir"     "KIMLIK_COZULEMEDI" \
  dogrula "k:ygt-99hd-2021-1-2022-2"
check "BAM kararı bağlantılı Yargıtay incelemesini gösterir" "ÜST İNCELEME Yargıtay k:ygt-11hd-2026-711-2026-5227: onama" \
  derinles k:bam-ist-bam-4hd-2024-1746-2025-4149 --butce 600
check "madde en çok dayanan kararları listeler" "DAYANAN KARARLAR" \
  derinles m:6502/11 --butce 600
check "Yargıtay'da bozulmuş BAM atfı uyarılır" "Yargıtay'da bozulmuş görünüyor" \
  dogrula "k:bam-ist-bam-3hd-2024-3399-2025-1043"
check "madde metni açılır"                   "Zamanaşımı" \
  derinles m:6502/12 --butce 300
check "değişen madde son değişiklik tarihini gösterir" "DEĞİŞİKLİK son 24.03.2022" \
  derinles m:6502/48 --butce 1500
check "olaydan sonra değişen dayanak uyarılır" "olaydan sonra değişti" \
  hesapla cayma_suresi '{"teslim_tarihi":"2021-01-10","sozlesme_turu":"mesafeli_mal"}'
check "kart atıflı madde olaydan sonra değiştiyse uyarılır" "olaydan sonra değişti" \
  sor "İnternetten aldığım ürünü iade etmek istiyorum, 14 gün geçmedi" --tarih 2021-01-10
check "her yanıt disclaimer taşır"           "NOT Bilgi amaçlıdır" \
  sor "Kredi kartımdan yıllık aidat kesilmiş"

# bütçe: 400 token istenince 400'ü aşmamalı
out=$(run sor "Bayiden aldığım arabanın motoru arızalı" --butce 400)
tok=$(sed -nE 's/.*\[([0-9]+) token.*/\1/p' <<<"$out" | tail -1)
if [ -n "${tok:-}" ] && [ "$tok" -le 400 ]; then
  PASS=$((PASS+1)); printf '  ✔ bütçe aşılmıyor (%s ≤ 400 token)\n' "$tok"
else
  FAIL=$((FAIL+1)); FAILED+=("bütçe"); printf '  ✘ bütçe aşıldı: %s\n' "${tok:-ölçülemedi}"
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "SONUÇ: $PASS/$((PASS+FAIL)) geçti — kabul testi BAŞARILI"
  exit 0
fi
echo "SONUÇ: $PASS/$((PASS+FAIL)) geçti — BAŞARISIZ: ${FAILED[*]}"
exit 1
