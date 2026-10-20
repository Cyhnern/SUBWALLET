# SubWallet — Abonelik & Cüzdan Yönetimi Süper Uygulaması 💳🚀

**SubWallet**, kişisel aboneliklerinizi, grup içi ortak harcamalarınızı ve zombi abonelik risklerinizi akıllı algoritmalarla yönetmenizi sağlayan üretime hazır bir SaaS monorepo uygulamasıdır.

---

## 🌟 Ana Özellikler

### 1. 🎬 Popüler Servis Kataloğu & Hızlı Seçim
- **Netflix**, **Spotify**, **YouTube Premium**, **Disney+**, **ChatGPT Plus**, **Amazon Prime**, **Apple Music**, **iCloud+**, **Exxen**, **BluTV**, **Midjourney**, **PlayStation Plus**, **Xbox Game Pass** gibi popüler servisler hazır logoları ve tahmini fiyatlarıyla gelir.
- Abonelik eklerken tek tıkla servis adı, kategorisi ve fiyatı otomatik doldurulur.

### 2. 👥 Ortak Hesaplar & Otomatik Maliyet Paylaşımı (Shared Accounts)
- Arkadaşlarınız veya ailenizle ortak hesaplar (ör. *"Ev Netflix Grubu"*, *"Yazılım Havuzu"*) oluşturun.
- Üye davet edin, rolleri yönetin (`owner`, `admin`, `member`).
- Fatura döneminde kişibaşı düşen tutarlar (`cost_splits`) adilce hesaplanır. Tek tıkla ödeme durumunu **"Ödendi"** olarak işaretleyebilirsiniz (`Settle`).

### 3. 🧟 Akıllı Zombi Abonelik Tespiti & Hızlı Aksiyonlar
- **Çok sinyalli risk skorlama modeli**:
  - İnaktiflik (30+ gündür kullanılmama)
  - Sessiz fiyat artışları (Son 90 günde %20+ fiyat artışı)
  - Mükerrer kategori harcaması
  - Bitip unutulan deneme sürümleri
- Dashboard üzerinde risk kartları ve tek tıkla hızlı işlem butonları:
  - `✓ Kullandım` (Son kullanım tarihini günceller, zombi skorunu sıfırlar)
  - `⏸️ Duraklat`
  - `✕ İptal Et`

### 4. 💱 Çoklu Para Birimi (Multi-Currency) & Anlık Kur Çevrimi
- Harcamalarınız **USD ($)**, **EUR (€)** veya **TRY (₺)** cinsinden olsa dahi, akıllı döviz çevrim motoru tüm harcamaları seçtiğiniz **Temel Para Birimine** anlık kurlar üzerinden çevirir.
- Aylık Harcama (Burn-Rate) ve Kategori Dağılımı %100 matematiksel doğrulukla hesaplanır.

### 5. 🔔 Expo Push Notification & Hatırlatma Gün Ayarları
- Yaklaşan fatura ödemeleriniz için cihazınıza canlı Push Notification uyarısı.
- Yenilemeden **7 gün**, **3 gün** veya **1 gün** önce haber verilmesi için özelleştirilebilir profil ayarları.

### 6. 📄 Fatura & Makbuz Görseli Yükleme (Invoice Attachments)
- Aboneliklerinize ait fatura, makbuz görseli veya belge URL'lerini ekleyin, uygulama içinden görüntüleyin ve indirin.

---

## 🏗️ Sistem Mimarisi & Teknoloji Yığını

```
subwallet/
├── apps/
│   ├── api/                   # NestJS Backend (Modüler Monolit)
│   │   ├── prisma/schema.prisma  # PostgreSQL Prisma Veritabanı Şeması
│   │   ├── src/
│   │   │   ├── modules/       # Auth, Users, Subscriptions, Categories, SharedAccounts, Analytics, ServiceProviders
│   │   │   └── queues/        # Redis & BullMQ Zamanlanmış İşler (Scheduler / Processor)
│   └── mobile/                # Expo React Native Mobil Uygulama
│       ├── app/               # Expo Router Tab & Ekran Yapısı
│       └── src/               # TanStack Query API İstemcileri, Tema, Tipler
└── packages/
    └── shared-types/          # Monorepo Paylaşılan Tipler
```

| Katman | Teknoloji |
|---|---|
| **Mobil Uygulama** | Expo (React Native) + Expo Router + TanStack Query |
| **Backend Framework** | NestJS (Node.js / TypeScript) |
| **Veritabanı & ORM** | PostgreSQL 16 + Prisma ORM |
| **Kuyruk & Önbellek** | Redis 7 + BullMQ (Arka plan fatura hatırlatıcıları) |
| **Kimlik Doğrulama** | JWT (Access + Refresh token rotasyonu) + argon2id |
| **Monorepo Aracı** | npm workspaces + Turborepo |

---

## 🚀 Hızlı Başlangıç

### 1. Kurulum ve Servisleri Başlatma
```bash
# Bağımlılıkları kur
npm install

# PostgreSQL & Redis kapsayıcılarını Docker ile başlat (Port: 5433 / 6379)
docker compose up -d

# Prisma şemasını veritabanıyla senkronize et
npx prisma db push --schema=apps/api/prisma/schema.prisma

# Tüm monorepo projelerini çalıştır (API + Mobil)
npm run dev
```

### 2. Erişim Adresleri
- **Mobil Web Arayüzü**: `http://localhost:8081`
- **NestJS API**: `http://localhost:3000/api/v1`
- **Swagger API Dokümantasyonu**: `http://localhost:3000/docs`
- **Redis Commander UI**: `http://localhost:8082`

---

## 🧪 Testleri Çalıştırma

Projede bulunan **32/32** birim test süitini çalıştırmak için:

```bash
# NestJS Backend birim testlerini çalıştır
npm --workspace apps/api run test

# Mobil TypeScript tip kontrolü
npx tsc --noEmit -p apps/mobile/tsconfig.json
```

---

## 📑 API Uç Noktaları Özeti

| Modül | Metot & Yol | Açıklama |
|---|---|---|
| **Auth** | `POST /auth/register` | Kayıt ol (argon2id hashleme) |
| **Auth** | `POST /auth/login` | Giriş yap & JWT token çifti al |
| **Subscriptions** | `GET /subscriptions` | Aktif abonelikleri filtrele ve listele |
| **Subscriptions** | `POST /subscriptions` | Yeni abonelik ekle (Kategori, Fatura eklentisi vb.) |
| **Subscriptions** | `POST /subscriptions/:id/mark-used` | "Bugün kullandım" olarak işaretle (Zombi skorunu sıfırlar) |
| **Subscriptions** | `POST /subscriptions/:id/pause` | Aboneliği duraklat |
| **Shared Accounts** | `GET /shared-accounts` | Dahil olunan ortak hesap gruplarını getir |
| **Shared Accounts** | `POST /shared-accounts/:id/members` | Gruba e-posta ile üye davet et |
| **Shared Accounts** | `POST /shared-accounts/:id/cost-splits/:splitId/settle` | Borç payını "Ödendi" olarak işaretle |
| **Analytics** | `GET /analytics/burn-rate` | Dönüştürülmüş aylık/yıllık harcama projeksiyonu |
| **Analytics** | `GET /analytics/zombie-subscriptions` | Zombi abonelik risk tespiti sonuçları |
| **Analytics** | `GET /analytics/exchange-rates` | Güncel anlık döviz kurları haritası |
| **Service Providers** | `GET /service-providers` | Popüler servis kataloğu listesi |

---

## 📝 Lisans
MIT License.
