/**
 * The demo's only two pages. No JavaScript, no external assets, no cookies.
 *
 * Everything dynamic is escaped here; the server never interpolates raw input
 * into markup anywhere else. That keeps the page usable on any phone and keeps
 * the CSP down to `default-src 'none'`.
 */

const KACIS: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function kacis(s: string): string {
  return s.replace(/[&<>"']/g, (c) => KACIS[c] ?? c);
}

const TALEPLER: { deger: string; ad: string }[] = [
  { deger: "", ad: "Belirtmek istemiyorum" },
  { deger: "iade", ad: "Para iadesi" },
  { deger: "degisim", ad: "Değişim" },
  { deger: "onarim", ad: "Onarım" },
  { deger: "indirim", ad: "İndirim" },
  { deger: "tazminat", ad: "Tazminat" },
  { deger: "iptal", ad: "İptal" },
  { deger: "bilgi", ad: "Sadece bilgi" },
];

const STIL = `
:root{--kagit:#f6f3ee;--murekkep:#1c1a17;--soluk:#6b635a;--vurgu:#7c1f2b;--cizgi:#ded6c9;--kutu:#fffdf9}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--kagit);color:var(--murekkep);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:680px;margin:0 auto;padding:24px 18px 64px}
h1{font-size:1.45rem;line-height:1.2;margin:18px 0 6px;letter-spacing:-.01em}
h2{font-size:1.05rem;margin:0 0 8px}
p{margin:0 0 14px}
.giris{color:var(--soluk)}
.uyari{background:#fff4f4;border:1px solid #e9c9c9;border-left:4px solid var(--vurgu);padding:10px 12px;border-radius:6px;font-size:.86rem;color:#5b2424}
form{background:var(--kutu);border:1px solid var(--cizgi);border-radius:10px;padding:16px;margin-top:18px}
label{display:block;font-size:.86rem;font-weight:600;margin:0 0 12px}
label em{font-weight:400;color:var(--soluk);font-style:normal}
textarea,input,select,button{font:inherit;width:100%;margin-top:5px;padding:10px 11px;border:1px solid var(--cizgi);border-radius:7px;background:#fff;color:inherit}
textarea{resize:vertical;min-height:104px}
textarea:focus,input:focus,select:focus,button:focus{outline:2px solid var(--vurgu);outline-offset:1px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
.grid label.wide{grid-column:1/-1}
button{background:var(--vurgu);color:#fff;border-color:var(--vurgu);font-weight:650;cursor:pointer;margin-top:2px;padding:12px}
button:hover{filter:brightness(1.08)}
.ipucu{font-size:.82rem;color:var(--soluk);margin:14px 0 0}
.ipucu li{margin-bottom:3px}
.cevap{background:var(--kutu);border:1px solid var(--cizgi);border-radius:10px;padding:16px;margin:18px 0;white-space:pre-wrap;word-wrap:break-word;font:15px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.lejant{font-size:.8rem;color:var(--soluk);margin-top:-6px}
a.geri{display:inline-block;margin-top:6px;color:var(--vurgu);font-weight:650;text-decoration:none}
a.geri:hover{text-decoration:underline}
.hata{background:#fff4f4;border:1px solid #e9c9c9;border-radius:8px;padding:12px;margin-top:16px}
footer{margin-top:32px;padding-top:14px;border-top:1px solid var(--cizgi);font-size:.78rem;color:var(--soluk)}
.sorma{margin-top:16px}
@media (max-width:520px){.grid{grid-template-columns:1fr}}
`;

function kabuk(baslik: string, govde: string): string {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>${kacis(baslik)}</title>
<style>${STIL}</style>
</head>
<body>
<main>
${govde}
<footer>
  <p><strong>Bu bir avukat değildir.</strong> Sayfa bilgi amaçlıdır, hukuki danışmanlık vermez;
  somut olayınız için bir avukata danışın. Süreler ve tutarlar mevzuat değişikliğiyle geçersizleşebilir;
  yanıttaki kaynakları resmî metinden teyit edin.</p>
  <p>Sorunuz sunucuda saklanmaz, log'a yazılmaz. Sayfada çerez ve takip kodu yoktur.</p>
</footer>
</main>
</body>
</html>`;
}

export function formSayfasi(token: string, hata?: string): string {
  const hataKutusu = hata ? `<div class="hata" role="alert">${kacis(hata)}</div>` : "";
  const secenekler = TALEPLER.map(
    (t) => `<option value="${t.deger}">${kacis(t.ad)}</option>`,
  ).join("");
  return kabuk(
    "Hukuk asistanı — dene",
    `<h1>Başına geleni anlat, yol haritasını gör.</h1>
<p class="giris">Türk tüketici hukuku üzerine çalışan bir deneme sayfası. Sorunu kendi
cümlelerinle yaz; sistem resmî kaynaklara dayanan, süreleri hesaplanmış bir yanıt çıkarır.
Her cümlenin yanında dayanağı (kanun maddesi veya mahkeme kararı) bulunur.</p>
<p class="uyari">Deneysel sürüm. Avukat yerine geçmez; acil sürelerde (zamanaşımı, tahliye,
işten çıkarma) mutlaka bir avukata danışın.</p>
${hataKutusu}
<form method="post" action="/${token}/">
  <label for="ozet">Ne oldu? <em>(kendi cümlelerinle, en fazla 400 karakter)</em>
    <textarea id="ozet" name="ozet" maxlength="400" required rows="5"
      placeholder="Örnek: Bayiden aldığım sıfır arabanın şanzımanı 3 ayda 4 kez arıza yaptı. Paramı geri alabilir miyim?"></textarea>
  </label>
  <div class="grid">
    <label>Ürün / hizmet <em>(isteğe bağlı)</em>
      <input name="urun_hizmet" maxlength="80" placeholder="oto, telefon, tatil">
    </label>
    <label>Uyuşmazlık tutarı (TL) <em>(isteğe bağlı)</em>
      <input name="tutar_tl" type="number" min="0" step="1" inputmode="numeric" placeholder="250000">
    </label>
    <label>Olay / teslim tarihi <em>(isteğe bağlı)</em>
      <input name="olay_tarihi" type="date">
    </label>
    <label>Ne istiyorsun?
      <select name="talep">${secenekler}</select>
    </label>
    <label class="wide">Sen kimsin?
      <select name="kullanici_rolu">
        <option value="tuketici">Tüketici (alıcı)</option>
        <option value="satici">Satıcı</option>
        <option value="diger">Diğer</option>
      </select>
    </label>
  </div>
  <button type="submit">Yol haritasını göster</button>
</form>
<ul class="ipucu">
  <li>Tarih ve tutar verirsen süreler ve görevli merci daha isabetli hesaplanır.</li>
  <li>“Ne oldu?” kutusuna hukuk terimi değil, yaşadığını yaz.</li>
  <li>Yanıt bir avukat görüşü değil; hangi kaynağa bakacağını gösteren bir haritadır.</li>
</ul>`,
  );
}

export function sonucSayfasi(token: string, metin: string, sureMs: number): string {
  return kabuk(
    "Yanıt — hukuk asistanı",
    `<h1>Yanıt</h1>
<p class="giris">${sureMs} ms'de üretildi. Aşağıdaki metin, kaynak kimlikleriyle birlikte
olduğu gibi gösterilir.</p>
<pre class="cevap">${kacis(metin)}</pre>
<p class="lejant">Kısa okuma anahtarı: <strong>m:</strong> kanun maddesi ·
<strong>k:</strong> mahkeme kararı · <strong>t/</strong> konu düğümü · <strong>[teyit bekliyor]</strong>
uzman onayından geçmemiş değer.</p>
<p class="sorma"><a class="geri" href="/${token}/">← Yeni bir soru sor</a></p>`,
  );
}

export function hataSayfasi(token: string, mesaj: string, kod = 400): { html: string; kod: number } {
  return {
    kod,
    html: kabuk(
      "Hata — hukuk asistanı",
      `<h1>Olmadı</h1>
<div class="hata" role="alert">${kacis(mesaj)}</div>
<p class="sorma"><a class="geri" href="/${token}/">← Geri dön ve tekrar dene</a></p>`,
    ),
  };
}

/** Deliberately information-free: an unknown path says nothing about what exists. */
export function bulunamadiSayfasi(): string {
  return `<!doctype html>
<html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Bulunamadı</title></head>
<body style="font:16px system-ui;padding:10vh 8vw;color:#444">
<p>Bu adreste bir sayfa yok.</p>
</body></html>`;
}
