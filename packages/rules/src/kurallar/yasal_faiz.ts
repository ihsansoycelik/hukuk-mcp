/**
 * Kural 8 — yasal / temerrüt faizi (3095 sayılı Kanun).
 *
 * 3095 m.1 (Değişik: 16/7/2026-7589/10 md., yürürlük 31/7/2026): kanuni faiz,
 * TCMB'nin önceki yılın 31 Aralık günü kısa vadeli kredi işlemlerinde uyguladığı
 * reeskont oranının %80'idir; 30 Haziran oranı 31 Aralık oranından 5 puan veya
 * daha fazla farklıysa yılın ikinci yarısında 30 Haziran oranının %80'i geçerlidir.
 * Bu tarihten önce 5335 sayılı Kanun'la belirlenen %9 oranı uygulanıyordu.
 *
 * 3095 m.3: "Kanuni faiz ve temerrüt faizi hesaplanırken mürekkep faiz
 * yürütülemez." 6502 m.4/7 de tüketici işlemlerinde bileşik faizi yasaklar.
 * Bu yüzden hesap BASİT faizdir; varsayım sonuçta açıkça yazılır.
 *
 * 3095 m.2/2: ticari işlerde avans faizi kanuni faizden yüksekse temerrüt faizi
 * avans oranı üzerinden istenebilir; oran yılın ilk yarısında önceki 31 Aralık,
 * ikinci yarısında 30 Haziran avans oranı (5 puan fark kuralı) ile belirlenir.
 */
import { z } from "zod";
import type { KuralSonucu } from "@hukuk/schema";
import type { Kural, ParametreDegeri, ParametreOkuyucu } from "../types.ts";
import {
  belirsizSonuc,
  eksikGirdiSonucu,
  enZayifOnay,
  parametreOku,
  parametreUyarisi,
  sonucOlustur,
  surumBirlestir,
  type ParametreHatasi,
} from "../parametre.ts";
import { gunEkle, gunFarki, isoGecerliMi, tarihKisa, tarihYaz } from "../tarih.ts";
import { tlYaz, IsoTarih, zodEksikleri } from "./ortak.ts";

const Semasi = z.object({
  anapara_tl: z.number().finite().positive(),
  baslangic: IsoTarih,
  bitis: IsoTarih,
  tur: z.enum(["kanuni", "ticari_temerrut"]).optional().default("kanuni"),
});

export type Girdi = z.infer<typeof Semasi>;

interface Dilim {
  bas: string;
  bit: string;
  oran: number;
  gun: number;
}

class OranHatasi extends Error {
  readonly kod: ParametreHatasi;
  readonly tarih: string;
  constructor(kod: ParametreHatasi, mesaj: string, tarih: string) {
    super(mesaj);
    this.name = "OranHatasi";
    this.kod = kod;
    this.tarih = tarih;
  }
}

interface OranOkuma {
  oran: number;
  kayit: ParametreDegeri;
}

function oranOku(p: ParametreOkuyucu, anahtar: string, tarih: string): OranOkuma {
  const s = parametreOku(p, "yasal_faiz", anahtar, tarih);
  if (!s.ok) throw new OranHatasi(s.kod, s.mesaj, tarih);
  if (typeof s.kayit.deger !== "number" || !Number.isFinite(s.kayit.deger)) {
    throw new OranHatasi("PARAMETRE_TIPI_HATALI", `${anahtar} sayı değil`, tarih);
  }
  return { oran: s.kayit.deger, kayit: s.kayit };
}

/** 3095 m.2/2: ticari temerrütte o yılın yarısı için geçerli avans oranı. */
function avansOrani(p: ParametreOkuyucu, tarih: string): OranOkuma {
  const yil = Number(tarih.slice(0, 4));
  const ilkYari = oranOku(p, "avans_oran", `${yil - 1}-12-31`);
  const ikinciYari = oranOku(p, "avans_oran", `${yil}-06-30`);
  const ay = Number(tarih.slice(5, 7));
  if (ay <= 6) return ilkYari;
  const fark = Math.abs(ikinciYari.oran - ilkYari.oran);
  return fark >= 5 ? ikinciYari : ilkYari;
}

function dilimYaz(d: Dilim): string {
  return `${tarihKisa(d.bas)}–${tarihKisa(d.bit)} %${String(d.oran).replace(".", ",")} (${d.gun} gün)`;
}

export function uygula(g: Girdi, p: ParametreOkuyucu, _bugun: string): KuralSonucu {
  if (!isoGecerliMi(g.baslangic) || !isoGecerliMi(g.bitis)) {
    return eksikGirdiSonucu({ id: "yasal_faiz" }, ["baslangic", "bitis"], [], "faiz-3095.1");
  }
  const gunSayisi = gunFarki(g.baslangic, g.bitis);
  if (gunSayisi <= 0) {
    return belirsizSonuc({
      kisa: "Faiz dönemi pozitif olmalı: bitiş tarihi başlangıçtan sonra olmalıdır.",
      dayanak: ["m:3095/1@2005-05-01"],
      uyarilar: ["Sıfır/negatif dönem için faiz hesaplanmaz."],
      parametre_surumu: "faiz-3095.1",
      onay_durumu: "teyit_bekliyor",
    });
  }

  const gunKonvansiyonu = parametreOku(p, "yasal_faiz", "yil_gun_sayisi", g.baslangic);
  if (!gunKonvansiyonu.ok || typeof gunKonvansiyonu.kayit.deger !== "number") {
    return belirsizSonuc({
      kisa: "Faiz gün konvansiyonu (yıl kaç gün) parametreden okunamadı; hesap yapılmadı.",
      dayanak: ["m:3095/1@2005-05-01"],
      uyarilar: [
        gunKonvansiyonu.ok
          ? "yasal_faiz/yil_gun_sayisi sayı değil."
          : `${gunKonvansiyonu.kod}: ${gunKonvansiyonu.mesaj}`,
      ],
      parametre_surumu: "faiz-gun-konvansiyonu.1",
      onay_durumu: "teyit_bekliyor",
    });
  }
  const gunSayisiYil = gunKonvansiyonu.kayit.deger;

  const kullanilanKayitlar = new Map<string, ParametreDegeri>();
  kullanilanKayitlar.set(gunKonvansiyonu.kayit.surum, gunKonvansiyonu.kayit);
  let toplam = 0;
  const dilimler: Dilim[] = [];
  let dilimBas = g.baslangic;
  let dilimOran: number | null = null;
  let dilimGun = 0;

  try {
    for (let i = 0; i < gunSayisi; i++) {
      const gun = gunEkle(g.baslangic, i);
      const kanuni = oranOku(p, "kanuni_oran", gun);
      kullanilanKayitlar.set(kanuni.kayit.surum, kanuni.kayit);
      let oran = kanuni.oran;
      if (g.tur === "ticari_temerrut") {
        const avans = avansOrani(p, gun);
        kullanilanKayitlar.set(avans.kayit.surum, avans.kayit);
        oran = Math.max(kanuni.oran, avans.oran);
      }
      toplam += (g.anapara_tl * oran) / 100 / gunSayisiYil;
      if (dilimOran === null) {
        dilimOran = oran;
        dilimBas = gun;
        dilimGun = 1;
      } else if (oran === dilimOran) {
        dilimGun += 1;
      } else {
        dilimler.push({ bas: dilimBas, bit: gunEkle(gun, -1), oran: dilimOran, gun: dilimGun });
        dilimOran = oran;
        dilimBas = gun;
        dilimGun = 1;
      }
    }
    if (dilimOran !== null) {
      dilimler.push({
        bas: dilimBas,
        bit: gunEkle(g.bitis, -1),
        oran: dilimOran,
        gun: dilimGun,
      });
    }
  } catch (e) {
    if (e instanceof OranHatasi) {
      return belirsizSonuc({
        kisa:
          `${tarihYaz(e.tarih)} için faiz oranı doğrulanamadı; dönem bölünemediği için toplam ` +
          `faiz hesaplanmadı.`,
        dayanak: ["m:3095/1@2005-05-01", "m:3095/2@2000-01-01"],
        uyarilar: [`${e.kod}: ${e.message}`],
        parametre_surumu: "faiz-3095.1",
        onay_durumu: "teyit_bekliyor",
      });
    }
    throw e;
  }

  const tutar = Math.round(toplam * 100) / 100;
  const kayitlar = [...kullanilanKayitlar.values()];
  const uyarilar = kayitlar
    .map((k) => parametreUyarisi("Faiz oranı", k))
    .filter((u): u is string => u !== null);

  if (g.tur === "kanuni" && g.bitis > "2026-07-30") {
    uyarilar.push(
      "3095 m.1, 7589 sayılı Kanun'la 31/7/2026'dan itibaren reeskont oranına bağlandı; " +
        "2026 ikinci yarısı için %31,00 türetilmiş değerdir (38,75 × 0,80).",
    );
  }
  if (g.tur === "ticari_temerrut") {
    uyarilar.push(
      "Ticari temerrütte 3095 m.2/2 uyarınca avans oranı kanuni faizden yüksekse o oran " +
        "uygulandı; yıl içi geçişlerde 5 puan fark kuralı dikkate alındı.",
    );
  }

  const varsayimlar = [
    "Basit faiz uygulandı: 3095 m.3 kanuni ve temerrüt faizinde mürekkep faizi yasaklar; " +
      "6502 m.4/7 tüketici işlemlerinde bileşik faizi yasaklar.",
    `Günlük hesap: yıllık oran / ${gunSayisiYil}; başlangıç günü faiz işler, bitiş günü işlemez.`,
    g.tur === "kanuni"
      ? "Oran, 3095 m.1'e göre dönem içinde değişiyorsa günlük olarak kırıldı."
      : "Oran, 3095 m.2'ye göre belirlenen temerrüt oranıdır; dönem içinde değişiyorsa kırıldı.",
  ];

  const dayanak = [
    "m:3095/3@1984-12-19",
    "m:3095/2@2000-01-01",
    "m:3095/1@2005-05-01",
    ...(g.bitis > "2026-07-30" ? ["m:3095/1@2026-07-31"] : []),
    "m:6502/4@2014-05-28",
  ];

  return sonucOlustur({
    sonuc: tutar,
    kisa:
      `${tlYaz(g.anapara_tl)} anapara için ${tarihYaz(g.baslangic)}–${tarihYaz(g.bitis)} döneminde ` +
      `${g.tur === "kanuni" ? "kanuni faiz" : "ticari temerrüt faizi"}: ${tlYaz(tutar)} ` +
      `(${gunSayisi} gün, basit faiz). Oranlar: ${dilimler.map(dilimYaz).join("; ")}.`,
    dayanak,
    varsayimlar,
    uyarilar,
    parametre_surumu: surumBirlestir(kayitlar.map((k) => k.surum)),
    onay_durumu: enZayifOnay(kayitlar.map((k) => k.durum)),
  });
}

export const yasalFaiz: Kural<Girdi> = {
  id: "yasal_faiz",
  girdiSemasi: Semasi,
  uygula,
};

export function girdiHatasi(hata: z.ZodError): KuralSonucu {
  return eksikGirdiSonucu(
    { id: "yasal_faiz" },
    zodEksikleri(hata),
    ["m:3095/1@2005-05-01"],
    "faiz-3095.1",
  );
}
