/**
 * Appeal-chain header parser for Yargıtay decision texts.
 *
 * Yargıtay texts open with the reviewed decision:
 *   MAHKEMESİ : İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi
 *   SAYISI : 2022/1723 Esas, 2025/1864 Karar
 *   İLK DERECE MAHKEMESİ : İstanbul 1. Asliye Ticaret Mahkemesi
 *   SAYISI : 2020/506 E., 2022/460 K.
 * Either line pair can be missing, and numbers can be masked ("2021/..."), in which
 * case esas/karar stay null and no corpus id can be built.
 */
import { kararAdaylari } from "./atif.ts";

export interface UstBaslikSatiri {
  seviye: "bam" | "ilkderece";
  /** court name as written ("İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi") */
  daire: string;
  /** "2022/1723" or null when masked/absent */
  esas: string | null;
  karar: string | null;
}

const BASLIK_SINIRI = 1600;
const SAYISI_RE =
  /SAYISI\s*:\s*(\d{4}\s*\/\s*(?:\d+|\.{2,}))\s*(?:E\.?|Esas)\b[\s.,;]*(\d{4}\s*\/\s*(?:\d+|\.{2,}))\s*(?:K\.?|Karar)?/i;

function numara(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.replace(/\s+/g, "");
  return /\d$/.test(t) ? t : null;
}

/** One "<LABEL> : <court>" line plus the SAYISI line that follows within two lines. */
function cift(satirlar: string[], i: number, mahkeme: string): { daire: string; esas: string | null; karar: string | null } {
  let esas: string | null = null;
  let karar: string | null = null;
  for (let j = i + 1; j <= i + 3 && j < satirlar.length; j++) {
    const l = satirlar[j]!;
    if (/^\s*(?:İLK DERECE\s+)?MAHKEMES[İI]\s*:/i.test(l)) break;
    const m = SAYISI_RE.exec(l);
    if (m) {
      esas = numara(m[1]);
      karar = numara(m[2]);
      break;
    }
  }
  return { daire: mahkeme.replace(/\s+/g, " ").trim(), esas, karar };
}

export function ustBaslikCoz(metin: string): UstBaslikSatiri[] {
  const bas = metin.slice(0, BASLIK_SINIRI).split("\n");
  const out: UstBaslikSatiri[] = [];
  let bamGordu = false;
  for (let i = 0; i < bas.length; i++) {
    const l = bas[i]!;
    // "\"İçtihat Metni\" MAHKEMESİ : …" shares a line with the header marker
    const m = /(?:^|\s)(İLK DERECE\s+)?MAHKEMES[İI]\s*:\s*(.+?)\s*$/.exec(l);
    if (!m) continue;
    const mahkeme = m[2]!;
    if (!mahkeme) continue;
    const ilk = !!m[1];
    const c = cift(bas, i, mahkeme);
    if (!ilk && /b[öo]lge\s+adliye/i.test(mahkeme)) {
      if (bamGordu) continue;
      bamGordu = true;
      out.push({ seviye: "bam", ...c });
    } else if (ilk) {
      out.push({ seviye: "ilkderece", ...c });
    } else if (!bamGordu && out.length === 0) {
      // a plain MAHKEMESİ line with no BAM (direct appeal from a first-instance court)
      out.push({ seviye: "ilkderece", ...c });
    }
  }
  return out;
}

/** Candidate corpus id of a BAM decision from a parsed header row; null when not buildable. */
export function bamKararId(s: UstBaslikSatiri): string | null {
  if (s.seviye !== "bam" || !s.esas || !s.karar) return null;
  return kararAdaylari(`${s.daire} ${s.esas} E. ${s.karar} K.`)[0] ?? null;
}
