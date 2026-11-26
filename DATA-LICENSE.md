# Korpus verisi hakkında

Kaynak kod MIT lisanslıdır (`LICENSE`). npm paketiyle gelen derlenmiş korpus
(`data/hukuk.db`) iki tür içerik taşır:

1. **Resmî metinler.** Kanun maddeleri (mevzuat.gov.tr) ve yayımlanmış mahkeme
   kararları (Adalet Bakanlığı bedesten.adalet.gov.tr / UYAP Emsal, Yargıtay).
   5846 sayılı Fikir ve Sanat Eserleri Kanunu m.31 uyarınca resmen yayımlanmış
   kanun, yönetmelik ve mahkeme kararlarının çoğaltılması ve yayılması serbesttir.
   Metinler kaynaktan değiştirilmeden alınır; her kayıt kaynak bağlantısını taşır.
   Kararlar kaynağın yayımladığı anonimleştirilmiş haliyle alınır; ek kişisel veri
   eklenmez.
2. **Bu projenin ürettiği katman.** Konu ağacı, kartlar, özetler, kural
   parametreleri ve yönlendirme verisi. Bunlar da MIT lisansıyla dağıtılır.

Korpus bir anlık görüntüdür. Mevzuat ve içtihat değişir; yanıttaki her kaynağı
resmî metinden teyit edin. Bu proje hukuki danışmanlık vermez.

Kaynak sitelere erişim kuralları (istek hızı, kimlik, önbellek):
[`docs/adr/ADR-001-kaynak-erisim.md`](docs/adr/ADR-001-kaynak-erisim.md).
