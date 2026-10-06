# Subwallet — Abonelik & Cüzdan Yönetimi Süper Uygulaması

Bu depo, `abonelik-cuzdan-mimari-plan.md` dosyasındaki mimari planın **Faz 0 + Faz 1 (kısmi) + Faz 2** iskeletini içerir: monorepo yapısı, Prisma şeması ve `SubscriptionsModule` ile hatırlatıcı kuyruğunun (BullMQ) çalışan bir implementasyonu.

## Hızlı Başlangıç

```bash
# 1. Bağımlılıkları kur (kök dizinde)
npm install

# 2. Postgres + Redis'i ayağa kaldır
docker compose up -d

# 3. API ortam değişkenlerini kopyala ve düzenle
cp apps/api/.env.example apps/api/.env

# 4. Prisma migration'ını çalıştır
npm run prisma:migrate

# 5. Geliştirme sunucusunu başlat
npm run dev
```

API varsayılan olarak `http://localhost:3000/api/v1` adresinde, Swagger dokümantasyonu `http://localhost:3000/docs` adresinde çalışır.

## Dizin Yapısı

```
apps/
  api/                 NestJS backend (modüler monolit)
    prisma/schema.prisma  Tüm veritabanı modelleri
    src/
      modules/           Her biri kendi controller/service/dto'sunu barındıran özellik modülleri
      queues/             BullMQ üretici (scheduler) + işçi (processor)
      common/             Prisma servisi, guard'lar, dekoratörler
packages/
  shared-types/        (Faz 5'te) Frontend-backend arası paylaşılan tipler
```

## Şu Anda Çalışır Durumda Olanlar

- ✅ Prisma şeması (tüm tablolar, enum'lar, ilişkiler)
- ✅ `SubscriptionsModule`: tam CRUD + durum makinesi (pause/resume/cancel) + geçmiş kaydı
- ✅ Hatırlatıcı kuyruğu: günlük zamanlayıcı (producer) + işçi (processor), idempotent job ID'leri
- ✅ Güvenlik middleware iskeleti (helmet, CORS, global validation pipe, Swagger)
- ✅ `AuthModule`: e-posta/parola kayıt+giriş (argon2id), JWT access token, refresh token rotasyonu
  (hash'lenmiş saklama + kullanımda otomatik iptal), Google OAuth2 (yönlendirme akışı) ve
  Apple Sign-In (mobil `identityToken` doğrulaması), rate limiting, timing-attack korumalı login
- ✅ `SharedAccountsModule`: ortak hesap CRUD, üye davet/çıkarma, rol bazlı yetkilendirme
  (`SharedAccountRoleGuard` + `@Roles()`), maliyet paylaşımı hesaplama motoru (eşit bölüşüm,
  yuvarlama farkı son üyeye yansıtılır), üyenin kendi payını "ödendi" işaretlemesi
- ✅ `AnalyticsModule`: burn rate (kişisel + ortak hesap payları dahil, aylık normalize),
  kategoriye göre harcama dağılımı, yaklaşan yenilemeler, çok sinyalli zombi abonelik
  skorlama motoru (`ZombieDetectorService`) + haftalık otomatik tarama ve bildirim
- ✅ `UsersModule`: profil okuma/güncelleme, bildirim tercihleri, hesap deaktivasyonu
- ✅ `CategoriesModule`: sistem kategorileri + kullanıcı özel kategorileri
- ✅ Expo mobil istemci (`apps/mobile`): auth, abonelik listesi/detay/CRUD, analiz panosu, profil

## Auth Akışını Hızlıca Test Etme

```bash
# Kayıt ol
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@ornek.com","password":"gizli123","fullName":"Test Kullanıcı"}'

# Dönen accessToken ile korumalı bir uç noktaya erişim
curl http://localhost:3000/api/v1/subscriptions \
  -H "Authorization: Bearer <accessToken>"

# refreshToken ile yeni bir token çifti al (eskisi otomatik iptal edilir)
curl -X POST http://localhost:3000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'
```

## Henüz Yapılacaklar

- `NotificationsService`: Expo Push / Resend gerçek entegrasyonu (şu an log + DB kaydı)
- Ortak hesap ve maliyet paylaşımı ekranları henüz mobilde yok
- Kur çevirimi (`exchange_rates`) gerçek döviz servisine bağlanacak

Detaylı yol haritası için `abonelik-cuzdan-mimari-plan.md` dosyasındaki Bölüm 5'e bakınız.
