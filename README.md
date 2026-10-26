# SubWallet — Abonelik & Cüzdan Yönetimi Süper Uygulaması 💳🚀

**SubWallet**, kişisel aboneliklerinizi, grup içi ortak harcamalarınızı ve zombi abonelik risklerinizi akıllı algoritmalarla yönetmenizi sağlayan üretime hazır, yüksek güvenlikli bir SaaS monorepo uygulamasıdır.

---

## 🌟 Öne Çıkan Gelişmiş Özellikler & Altyapı Güvenceleri

### 1. 🛡️ Kurumsal Kimlik & Oturum Güvenliği (Auth & S-3 / S-10 / S-11)
- **argon2id Şifreleme**: Parolalar endüstri standardı argon2id ile hash'lenir.
- **SHA-256 Refresh Token Rotasyonu & Token Çalınma Tespiti**: Refresh token'lar SHA-256 hash'leri ile güvenceye alınır. Kullanılmış veya iptal edilmiş bir token tekrar denendiğinde sistem saldırı şüphesi (Token Theft) algılayarak **tüm cihaz oturumlarını anında sonlandırır**.
- **E-posta Doğrulama & OAuth Güvenliği**: Kayıt anında 24 saatlik doğrulama token'ı üretilir (`verify-email`). Google ve Apple OAuth girişleri kriptografik imza ve `email_verified: true` kontrolleriyle doğrulanır.
- **URL Sızıntı Koruması (Authorization Code Flow)**: Web OAuth yönlendirmelerinde token'lar URL'de açıkça gösterilmez; **60 saniyelik tek kullanımlık kod (`oAuthExchangeCode`)** ile `POST /auth/oauth/exchange` üzerinden takas edilir.
- **KVKK Uyumlu Hesap Silme**: Parola doğrulamalı hesap kapatma, sahip olunan ortak hesapların en kıdemli üyeye devredilmesi veya boşsa silinmesi, hassas verilerin soft-delete sırasında `null` yapılması ve 30 gün sonra kalıcı temizlik (hard-delete purge cron) özellikleri.

### 2. 👥 Ortak Hesaplar & Adil Maliyet Paylaşımı (A-1)
- **Kuruş Hassasiyetinde Dağıtım**: Bölme işleminde artan kuruş artıkları (`remainderCents`) `joinedAt: 'asc'` sırasına göre ilk üyelerden başlayarak adil bir şekilde dağıtılır (Örn. 3 üyeli hesapta 10.00 TL → **3.34 / 3.33 / 3.33 TL**).
- **Atomik Koruma**: Ödenmiş (`isSettled = true`) maliyet payları, yeniden hesaplama işlemlerinde veritabanı düzeyinde atomik olarak korunur.

### 3. 🧟 Akıllı Zombi Abonelik Tespiti & Optimizasyon (A-3)
- **Çok Sinyalli Risk Skorlama**: 30+ gün kullanılmama, gizli fiyat artışları, mükerrer kategori harcamaları ve biten deneme süreleri.
- **Cursor Tabanlı Sayfalama**: Büyük veri kümelerinde bellek (RAM) dostu tarama (`take: 200`).
- **Bildirim Logu Koruması**: Son 30 gün içinde uyarılan abonelikler için tekrar bildirim gönderilmez.

### 4. 💱 Canlı Döviz Çevrim Motoru (Analytics & Exchange Rates)
- `ExchangeRatesService` servisi uygulama açılışında ve saatlik cron görevleriyle (`@Cron(CronExpression.EVERY_HOUR)`) canlı kurları (`open.er-api.com`) non-blocking olarak çeker.
- **Kısmi Güncelleme Koruması**: Desteklenen tüm kurların pozitif sayı olduğu atomik olarak doğrulanmadan önbellek güncellenmez.

---

## 🏗️ Sistem Mimarisi & Teknoloji Yığını

```
subwallet/
├── apps/
│   ├── api/                   # NestJS Backend (Modüler Monolit)
│   │   ├── prisma/schema.prisma  # PostgreSQL Prisma Veritabanı Şeması
│   │   ├── src/
│   │   │   ├── modules/       # Auth, Users, Subscriptions, Categories, SharedAccounts, Analytics, ServiceProviders
│   │   │   └── queues/        # Redis & BullMQ Zamanlanmış İşler (Cluster Idempotent Schedulers)
│   └── mobile/                # Expo React Native Mobil Uygulama
│       ├── app/               # Expo Router Tab & Ekran Yapısı
│       └── src/               # TanStack Query API İstemcileri, Tema, Tipler
```

| Katman | Teknoloji |
|---|---|
| **Mobil Uygulama** | Expo (React Native) + Expo Router + TanStack Query |
| **Backend Framework** | NestJS (Node.js / TypeScript) |
| **Veritabanı & ORM** | PostgreSQL 16 + Prisma ORM (CHECK kısıtları ve kompozit indeksler) |
| **Kuyruk & Önbellek** | Redis 7 + BullMQ (`upsertJobScheduler` ile çoklu instance eşzamanlılık koruması) |
| **Kimlik Doğrulama** | JWT (Access + Refresh token rotasyonu) + argon2id |

---

## 🚀 Hızlı Başlangıç

### 1. Kurulum ve Servisleri Başlatma
```bash
# Bağımlılıkları kur
npm install

# PostgreSQL & Redis kapsayıcılarını Docker ile başlat (Port: 5433 / 6379)
docker compose up -d

# Prisma şemasını veritabanıyla senkronize et ve seed'leri çalıştır
npx prisma db push --schema=apps/api/prisma/schema.prisma

# Tüm monorepo projelerini çalıştır (API + Mobil)
npm run dev
```

### 2. Erişim Adresleri
- **Mobil Web Arayüzü**: `http://localhost:8081`
- **NestJS API**: `http://localhost:3000/api/v1`
- **Swagger API Dokümantasyonu**: `http://localhost:3000/docs` (Yalnızca geliştirme ortamında / ENABLE_DOCS=true)
- **Redis Commander UI**: `http://localhost:8085`

---

## 🧪 Testleri Çalıştırma

Projede bulunan kapsamlı test paketini çalıştırmak için:

```bash
# NestJS Backend birim testleri (45/45 Geçti)
npm --workspace apps/api run test

# NestJS Backend E2E entegrasyon testleri (12/12 Geçti)
npm --workspace apps/api run test:e2e

# Mobil TypeScript tip kontrolü
npx tsc --noEmit -p apps/mobile/tsconfig.json
```

---

## 📝 Lisans
MIT License.
