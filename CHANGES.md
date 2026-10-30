# SUBWALLET — Uygulanan Düzeltmeler

Uygulananlar (kod incelemesindeki ID'lerle):

| ID | Değişiklik | Dosya |
|---|---|---|
| R-1 | Migration klasörleri doğru çalışma sırasına göre yeniden adlandırıldı | apps/api/prisma/migrations/* |
| R-2 | `members/me` (ayrılma) rotası parametreli rotadan önceye alındı, 204 döner | shared-accounts.controller.ts |
| R-3 | `.env.example` secret >= 32 karakter; Google stratejisi env yoksa kaydedilmez; CI: lint yerine build (prisma generate sonrası), gereksiz JWT_REFRESH_SECRET kaldırıldı, REDIS_HOST eklendi | .env.example, auth.module.ts, ci.yml |
| R-4 | Doğrulanmamış hesap OAuth ile bağlanınca parola ve açık oturumlar sıfırlanır (pre-hijacking) | auth.service.ts |
| R-5 | `verify-email` için DTO ile 64 hex token doğrulaması | auth.controller.ts, dto/verify-email.dto.ts |
| R-6 | Hesap silmede hayalet üye kalmaz, paylaşılan abonelikler yeni sahibe taşınır, bağlı hesaplarda da parola istenir | users.service.ts |
| R-7 | Döviz servisi: tek uçuşta istek, 60 sn yeniden deneme aralığı, 6 saat sonra 'fallback' bildirimi | exchange-rates.service.ts |
| R-3b | e2e testi `supertest` import ediyor ama bağımlılık eksikti: devDependencies a eklendi | apps/api/package.json |
| R-8 | Çift zombi taraması kaldırıldı (BullMQ kalır); deneme sinyali yalnızca bitişten sonraki 14 gün | analytics.module.ts, zombie-detector.service.ts |

Henüz uygulanmayanlar (rapordaki öneriler): OAuth exchange code PKCE/hash, davet akışı (DTO, kuyruk), billing-cycle yeniden yazımı,
Decimal ile para hesabı, cost split toplu SQL, mobil sayfalama ve logout token düzeltmesi, bildirim retry ve Expo receipts.

Doğrulama: `tsc` ile Prisma ile ilgisiz tip hatası kalmadı. Sandbox'ta Prisma motoru indirilemediği için tam derleme, birim ve e2e testleri çalıştırılmadı.
Yerelde: `npm install && npx prisma migrate reset && npm --workspace apps/api run build && npm --workspace apps/api test`
(Geliştirme DB'in eski migration adlarıyla uygulanmışsa `migrate reset` gerekir.)
