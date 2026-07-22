# Abonelik & Cüzdan Yönetimi Süper Uygulaması — Mimari Plan ve Yol Haritası

> Kapsam: Üretime hazır, ölçeklenebilir bir SaaS ürünü. Tekil kullanıcı aboneliklerinden, çoklu kullanıcılı ortak hesap/maliyet paylaşımına kadar tüm akışları kapsar.

---

## 1. Sistem Mimarisi ve Teknoloji Yığını

### 1.1 Önerilen Teknoloji Yığını

| Katman | Teknoloji | Gerekçe |
|---|---|---|
| **Mobil + Web (tek kod tabanı)** | **Expo (React Native) + Expo Router** | iOS/Android/Web tek kod tabanından çıkar; bildirim (push) altyapısı hazır (Expo Notifications). Panonuzun mobil-öncelikli olması (fatura hatırlatıcıları) için kritik. |
| **Web-özel Admin/Dashboard (opsiyonel)** | **Next.js 14+ (App Router)** | Karmaşık analitik dashboard'lar, SEO gerektiren landing page, SSR raporlar için. Expo Web yeterli değilse ayrı bir web app olarak eklenir. |
| **State/Veri Katmanı (Frontend)** | **TanStack Query + Zustand** | Sunucu state'i (React Query) ile UI state'i (Zustand) ayrımı; cache invalidation, optimistic update. |
| **Backend Framework** | **NestJS (Node.js/TypeScript)** | Modüler monolit için ideal: DI container, decorator tabanlı yapı, Guard/Interceptor/Pipe mimarisi, mikroservise geçişte kolay ayrıştırılabilirlik. Go alternatiftir ama ekip TypeScript ise NestJS geliştirme hızı açısından üstündür. |
| **Veritabanı** | **PostgreSQL 16** | İlişkisel bütünlük (kullanıcı-abonelik-ortak hesap FK zinciri), `NUMERIC` tipiyle para birimi hassasiyeti, JSONB ile esnek metadata. |
| **ORM** | **Prisma** veya **Drizzle ORM** | Prisma: hızlı geliştirme, migration yönetimi. Drizzle: SQL'e daha yakın, performans kritikse tercih edilir. Bu planda **Prisma** varsayılıyor. |
| **Cache / Kuyruk** | **Redis 7** | Session/cache + **BullMQ** için message broker. |
| **Arka Plan İşleri** | **BullMQ (Redis destekli)** | Cron benzeri zamanlanmış işler, retry/backoff, dead-letter queue desteği. |
| **Kimlik Doğrulama** | **JWT (access + refresh token) + OAuth2 (Google/Apple)** | `argon2` ile parola hashleme (bcrypt'ten daha güvenli, GPU saldırılarına dirençli). |
| **Bildirim** | **Expo Push Notifications + e-posta (Resend/SendGrid)** | Çok kanallı hatırlatıcı sistemi. |
| **Dosya/Medya** | **Cloudflare R2 / AWS S3** | Servis logoları, fatura PDF'leri. |
| **Gözlemlenebilirlik** | **OpenTelemetry + Grafana/Loki + Sentry** | Dağıtık izleme, hata takibi. |
| **CI/CD & Altyapı** | **Docker + GitHub Actions + Railway/Fly.io (başlangıç) → AWS ECS/EKS (ölçek)** | Küçük ekip için düşük operasyon yükü, büyüdükçe geçiş kolaylığı. |
| **API Katmanı** | **REST (OpenAPI/Swagger) + tRPC (opsiyonel, tam TS ise)** | REST, dış entegrasyonlar (webhook, üçüncü parti) için daha uyumlu; bu plan REST üzerinden ilerliyor. |

### 1.2 Mimari Yaklaşım: Modüler Monolit (Mikroservise Hazır)

**Neden mikroservis değil, modüler monolit?**
Erken aşamada mikroservis, dağıtık sistem karmaşıklığını (network latency, distributed transactions, service discovery) gereksiz yere ekler. NestJS'in modül yapısı, sınırları net (bounded context) modüller yazmanıza izin verir; her modül ileride bağımsız bir servise "kesilebilir".

```
apps/
├── api/                        # NestJS ana uygulama (modüler monolit)
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/            # Kimlik doğrulama, JWT, OAuth2
│   │   │   ├── users/           # Kullanıcı profili, tercihler
│   │   │   ├── subscriptions/   # Abonelik CRUD + yaşam döngüsü
│   │   │   ├── categories/      # Kategori yönetimi
│   │   │   ├── shared-accounts/ # Ortak hesap / maliyet paylaşımı
│   │   │   ├── notifications/   # Bildirim tercihleri + gönderim
│   │   │   ├── analytics/       # Burn rate, zombi abonelik tespiti
│   │   │   ├── billing-engine/  # Fatura döngüsü hesaplama motoru (core domain)
│   │   │   └── webhooks/        # Banka/kart entegrasyonu webhook'ları (ileride)
│   │   ├── queues/               # BullMQ processor'lar
│   │   │   ├── reminder.processor.ts
│   │   │   ├── billing-cycle.processor.ts
│   │   │   └── analytics.processor.ts
│   │   ├── common/                # Guard, Interceptor, Pipe, Filter
│   │   └── config/
│   └── prisma/
│       └── schema.prisma
├── mobile/                      # Expo (React Native) uygulaması
└── web/                          # Next.js dashboard (opsiyonel, faz 2)
packages/
├── shared-types/                 # DTO/tip paylaşımı (monorepo — Turborepo/Nx)
└── ui/                            # Paylaşılan tasarım sistemi bileşenleri
```

**Monorepo aracı önerisi:** Turborepo (basitlik) veya Nx (daha büyük ekip/ölçek). Bu, `shared-types` paketiyle frontend-backend arasında tip güvenliği sağlar (örn. Zod şemaları hem validasyon hem tip üretimi için).

### 1.3 Yüksek Seviye Sistem Diyagramı

Yukarıdaki diyagramda gösterildiği gibi istemci katmanı NestJS API'sine bağlanır; API, senkron işlemler için doğrudan PostgreSQL'e yazar, asenkron işler (hatırlatıcı, fatura döngüsü hesaplama) için ise Redis üzerinden BullMQ kuyruğuna görev bırakır. Kuyruk işçisi (worker) tetiklendiğinde bildirim servisine (push/e-posta) iletim yapar. Bu ayrım, API'nin kullanıcı isteğine hızlı yanıt vermesini (senkron yol) ve ağır/zamanlanmış işlerin arka planda, API'yi bloklamadan çalışmasını (asenkron yol) sağlar.

---

## 2. Veritabanı Şeması (PostgreSQL)

### 2.1 Tasarım Prensipleri

- Tüm birincil anahtarlar **UUID** (`gen_random_uuid()`) — dağıtık sistemlerde çakışma riski yok, dış sistemlere ID sızdırmıyor.
- Para tutarları **`NUMERIC(12,2)`** ile saklanır — `FLOAT` asla kullanılmaz (yuvarlama hatası riski).
- Her tabloda `created_at`, `updated_at` (trigger ile otomatik) — denetim (audit) için zorunlu.
- **Soft delete** (`deleted_at`) kritik tablolarda (kullanıcı, abonelik) — geri alınabilirlik ve analitik veri kaybını önlemek için.
- Çoklu para birimi desteği: her abonelik kendi `currency` alanını taşır; raporlama için kullanıcının `base_currency`'sine anlık kur ile çevrilir (ayrı bir `exchange_rates` tablosu ile).

### 2.2 Ana Şema (SQL DDL)

```sql
-- ============================================
-- UZANTI VE ENUM TANIMLARI
-- ============================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE billing_cycle_enum AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly', 'custom');
CREATE TYPE subscription_status_enum AS ENUM ('active', 'paused', 'cancelled', 'trial', 'expired');
CREATE TYPE payment_method_enum AS ENUM ('credit_card', 'debit_card', 'paypal', 'bank_transfer', 'crypto', 'other');
CREATE TYPE shared_account_role_enum AS ENUM ('owner', 'admin', 'member');
CREATE TYPE split_type_enum AS ENUM ('equal', 'percentage', 'fixed_amount');
CREATE TYPE notification_channel_enum AS ENUM ('push', 'email', 'sms');

-- ============================================
-- KULLANICILAR
-- ============================================
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email               VARCHAR(255) NOT NULL UNIQUE,
    password_hash       VARCHAR(255),              -- OAuth kullanıcılarda NULL olabilir
    full_name           VARCHAR(150) NOT NULL,
    avatar_url          TEXT,
    base_currency        CHAR(3) NOT NULL DEFAULT 'USD',   -- ISO 4217
    timezone            VARCHAR(64) NOT NULL DEFAULT 'UTC',
    oauth_provider      VARCHAR(30),               -- 'google' | 'apple' | NULL
    oauth_provider_id   VARCHAR(255),
    email_verified_at   TIMESTAMPTZ,
    push_token          TEXT,                       -- Expo push token
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    UNIQUE (oauth_provider, oauth_provider_id)
);
CREATE INDEX idx_users_email ON users (email) WHERE deleted_at IS NULL;

-- ============================================
-- KATEGORİLER (sistem varsayılanları + kullanıcı özel)
-- ============================================
CREATE TABLE categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = sistem geneli
    name          VARCHAR(80) NOT NULL,
    icon          VARCHAR(50),
    color_hex     CHAR(7),
    is_system     BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
);

-- ============================================
-- SERVİS KATALOĞU (Netflix, Spotify vb. — logo/marka ön tanımlı)
-- ============================================
CREATE TABLE service_providers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(120) NOT NULL UNIQUE,
    logo_url      TEXT,
    default_category_id UUID REFERENCES categories(id),
    website_url   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ORTAK HESAPLAR (Grup abonelik / maliyet paylaşımı havuzu)
-- ============================================
CREATE TABLE shared_accounts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          VARCHAR(120) NOT NULL,             -- örn. "Aile Netflix Havuzu"
    owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE shared_account_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shared_account_id UUID NOT NULL REFERENCES shared_accounts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role              shared_account_role_enum NOT NULL DEFAULT 'member',
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (shared_account_id, user_id)
);

-- ============================================
-- ABONELİKLER (çekirdek tablo)
-- ============================================
CREATE TABLE subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_account_id   UUID REFERENCES shared_accounts(id) ON DELETE SET NULL, -- NULL = kişisel
    service_provider_id UUID REFERENCES service_providers(id),
    category_id         UUID REFERENCES categories(id),
    custom_name         VARCHAR(120),               -- katalogda yoksa serbest isim
    price                NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    currency            CHAR(3) NOT NULL DEFAULT 'USD',
    billing_cycle       billing_cycle_enum NOT NULL DEFAULT 'monthly',
    custom_cycle_days   INTEGER,                     -- billing_cycle='custom' ise
    payment_method      payment_method_enum,
    status              subscription_status_enum NOT NULL DEFAULT 'active',
    start_date          DATE NOT NULL,
    next_billing_date   DATE NOT NULL,
    trial_end_date      DATE,
    cancelled_at        TIMESTAMPTZ,
    last_used_at        TIMESTAMPTZ,                 -- kullanım/aktivite takibi (zombi tespiti için)
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT chk_custom_cycle CHECK (
        (billing_cycle <> 'custom') OR (custom_cycle_days IS NOT NULL AND custom_cycle_days > 0)
    )
);
CREATE INDEX idx_subs_user_status ON subscriptions (user_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_subs_next_billing ON subscriptions (next_billing_date) WHERE status = 'active';
CREATE INDEX idx_subs_shared_account ON subscriptions (shared_account_id) WHERE shared_account_id IS NOT NULL;

-- ============================================
-- ABONELİK DURUM/FİYAT GEÇMİŞİ (denetim izi + fiyat artış takibi)
-- ============================================
CREATE TABLE subscription_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    changed_field   VARCHAR(50) NOT NULL,     -- 'price' | 'status' | 'billing_cycle'
    old_value       TEXT,
    new_value       TEXT,
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sub_history_sub_id ON subscription_history (subscription_id);

-- ============================================
-- MALİYET PAYLAŞIMI (ortak hesap içindeki bir aboneliğin kimler arasında nasıl bölüşüldüğü)
-- ============================================
CREATE TABLE cost_splits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    split_type      split_type_enum NOT NULL DEFAULT 'equal',
    split_value     NUMERIC(12,4),   -- percentage ise 0-100, fixed_amount ise tutar
    computed_amount NUMERIC(12,2) NOT NULL,  -- her fatura döngüsünde yeniden hesaplanır
    is_settled      BOOLEAN NOT NULL DEFAULT false,
    settled_at      TIMESTAMPTZ,
    billing_period_start DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subscription_id, user_id, billing_period_start)
);
CREATE INDEX idx_cost_splits_user_unsettled ON cost_splits (user_id, is_settled) WHERE is_settled = false;

-- ============================================
-- BİLDİRİM TERCİHLERİ VE GÖNDERİM GÜNLÜĞÜ
-- ============================================
CREATE TABLE notification_preferences (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    channels           notification_channel_enum[] NOT NULL DEFAULT ARRAY['push']::notification_channel_enum[],
    days_before_renewal INTEGER[] NOT NULL DEFAULT ARRAY[3, 1],   -- yenilemeden 3 gün ve 1 gün önce
    zombie_alerts_enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE notification_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE CASCADE,
    channel         notification_channel_enum NOT NULL,
    type            VARCHAR(50) NOT NULL,   -- 'renewal_reminder' | 'zombie_detected' | 'price_change'
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    status          VARCHAR(20) NOT NULL DEFAULT 'sent'   -- 'sent' | 'failed' | 'delivered'
);
CREATE INDEX idx_notif_log_user ON notification_log (user_id, sent_at DESC);

-- ============================================
-- updated_at OTOMATİK GÜNCELLEME TRIGGER'I
-- ============================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subs_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 2.3 Şema Tasarım Notları

- **`subscriptions.shared_account_id`** nullable — kişisel ve ortak abonelikler aynı tabloda tutulur, bu sorgu karmaşıklığını azaltır (tek kaynak doğruluk).
- **`cost_splits`** tablosu her fatura dönemi için ayrı satır tutar (`billing_period_start` ile UNIQUE), böylece geçmiş dönem borç/ödeme geçmişi bozulmadan kalır.
- **`last_used_at`** alanı, uygulama içi "bu servisi kullandım" işaretlemesi veya üçüncü parti entegrasyon (ör. e-posta makbuz taraması) ile güncellenir; zombi abonelik tespiti bu alana dayanır.
- **`subscription_history`** append-only bir tablo; UPDATE/DELETE yapılmaz, sadece INSERT — denetlenebilirlik için.

---

## 3. Temel Özellikler ve Arka Plan Mantığı

### 3.1 Abonelik CRUD ve Yaşam Döngüsü Yönetimi

**Durum makinesi (state machine):**

```
trial ──(deneme biter)──▶ active
active ──(kullanıcı duraklatır)──▶ paused
paused ──(kullanıcı devam ettirir)──▶ active
active ──(kullanıcı iptal eder)──▶ cancelled
active ──(next_billing_date geçer & ödeme başarısız)──▶ expired
```

Bu geçişler `SubscriptionsService` içinde merkezi bir `transitionStatus()` metoduyla yönetilir; her geçiş `subscription_history` tablosuna otomatik kayıt düşer (NestJS Interceptor ile).

**`next_billing_date` hesaplama mantığı** (billing-engine modülü, saf fonksiyon — test edilebilir olması kritik):

```typescript
// modules/billing-engine/billing-cycle.util.ts
import { addDays, addMonths, addYears } from 'date-fns';

export function calculateNextBillingDate(
  currentDate: Date,
  cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom',
  customDays?: number,
): Date {
  switch (cycle) {
    case 'weekly':    return addDays(currentDate, 7);
    case 'monthly':   return addMonths(currentDate, 1);
    case 'quarterly': return addMonths(currentDate, 3);
    case 'yearly':    return addYears(currentDate, 1);
    case 'custom':
      if (!customDays) throw new Error('custom_cycle_days zorunlu');
      return addDays(currentDate, customDays);
  }
}
```

> Ay sonu kenar durumları (ör. 31 Ocak → Şubat) `date-fns`'in `addMonths` fonksiyonu otomatik olarak taşan günü bir sonraki aya devretmeden en yakın geçerli tarihe indirger — bu davranış açıkça test edilmelidir (`31 Ocak + 1 ay = 28/29 Şubat`).

### 3.2 Otomatik Hatırlatıcı Sistemi (BullMQ)

**Mimari:** Tek bir "üretici" (producer) günlük çalışan bir **cron zamanlayıcı job**, yaklaşan yenilemeleri tarar ve her biri için ayrı, izlenebilir bir **iş (job)** kuyruğa ekler. Böylece tek bir büyük iş yerine binlerce küçük iş olur — biri başarısız olursa yalnızca o kullanıcı etkilenir, tüm sistem değil.

```typescript
// queues/reminder.module.ts
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'reminders',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: false, // hata ayıklama için sakla
      },
    }),
  ],
})
export class ReminderQueueModule {}
```

```typescript
// queues/reminder-scheduler.service.ts
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ReminderSchedulerService {
  constructor(@InjectQueue('reminders') private queue: Queue) {}

  // Her gün UTC 07:00'de çalışır — üretici (producer) rolü
  @Cron(CronExpression.EVERY_DAY_AT_7AM)
  async scheduleUpcomingReminders() {
    const candidates = await this.subscriptionsRepo.findRenewingWithin(7); // gün

    for (const sub of candidates) {
      const daysUntil = differenceInDays(sub.nextBillingDate, new Date());
      const prefs = await this.notifPrefsRepo.findByUserId(sub.userId);

      if (prefs.daysBeforeRenewal.includes(daysUntil)) {
        await this.queue.add(
          'send-renewal-reminder',
          { subscriptionId: sub.id, userId: sub.userId, daysUntil },
          { jobId: `reminder-${sub.id}-${daysUntil}` }, // idempotency — aynı iş iki kez kuyruklanmaz
        );
      }
    }
  }
}
```

```typescript
// queues/reminder.processor.ts — İşçi (worker/consumer) rolü
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('reminders')
export class ReminderProcessor extends WorkerHost {
  async process(job: Job<{ subscriptionId: string; userId: string; daysUntil: number }>) {
    const { subscriptionId, userId, daysUntil } = job.data;
    const user = await this.usersRepo.findById(userId);
    const sub = await this.subscriptionsRepo.findById(subscriptionId);

    await this.notificationService.send({
      userId,
      channel: user.notificationPrefs.channels,
      template: 'renewal_reminder',
      data: { serviceName: sub.customName, price: sub.price, daysUntil },
    });

    await this.notificationLogRepo.create({ userId, subscriptionId, type: 'renewal_reminder' });
  }
}
```

**Neden bu yaklaşım?**
- **Idempotency (`jobId`)**: Zamanlayıcı yanlışlıkla iki kez tetiklenirse (deploy sırasında, çoklu instance'ta) aynı iş tekrar kuyruklanmaz.
- **Retry + exponential backoff**: Bildirim servisi (Expo/SendGrid) geçici olarak yanıt vermezse otomatik yeniden dener.
- **Yatay ölçeklenebilirlik**: Birden fazla worker instance'ı aynı kuyruğu paylaşır; BullMQ Redis üzerinden dağıtık kilitleme yapar, aynı işi iki worker birden işlemez.

### 3.3 Analitik ve "Zombi Abonelik" Tespiti

**Burn rate hesaplama** (aylık normalize edilmiş toplam harcama):

```typescript
// modules/analytics/burn-rate.util.ts
const MONTHLY_MULTIPLIER: Record<BillingCycle, number> = {
  weekly: 52 / 12,
  monthly: 1,
  quarterly: 1 / 3,
  yearly: 1 / 12,
  custom: null, // customCycleDays ile hesaplanır
};

export function normalizeToMonthly(sub: Subscription): number {
  if (sub.billingCycle === 'custom') {
    return sub.price * (30 / sub.customCycleDays);
  }
  return sub.price * MONTHLY_MULTIPLIER[sub.billingCycle];
}

export function calculateMonthlyBurnRate(subs: Subscription[]): number {
  return subs
    .filter((s) => s.status === 'active')
    .reduce((total, s) => total + normalizeToMonthly(s) * getExchangeRate(s.currency), 0);
}
```

**Zombi abonelik tespit mantığı** — çok sinyalli bir skorlama modeli (basit eşik yerine, yanlış pozitifleri azaltmak için):

| Sinyal | Ağırlık | Açıklama |
|---|---|---|
| `last_used_at` 30+ gün önce veya NULL | %40 | Kullanıcı uygulama içinde "kullandım" işaretlemesi yapmamış |
| Fiyat son 90 günde %20+ arttı (`subscription_history`) | %25 | Sessiz fiyat artışı — genelde fark edilmez |
| Aynı kategoride 2+ aktif abonelik var (örn. 2 müzik servisi) | %20 | Olası mükerrer harcama |
| Deneme süresi bitmiş ama iptal edilmemiş | %15 | Klasik "unutulan deneme" tuzağı |

```typescript
// modules/analytics/zombie-detector.service.ts
@Injectable()
export class ZombieDetectorService {
  async scoreSubscription(sub: Subscription): Promise<ZombieScore> {
    let score = 0;
    const reasons: string[] = [];

    const daysSinceUse = sub.lastUsedAt
      ? differenceInDays(new Date(), sub.lastUsedAt)
      : Infinity;
    if (daysSinceUse >= 30) {
      score += 40;
      reasons.push('30+ gündür kullanılmadı');
    }

    const priceIncrease = await this.getPriceIncreasePercent(sub.id, 90);
    if (priceIncrease >= 20) {
      score += 25;
      reasons.push(`Son 90 günde fiyat %${priceIncrease} arttı`);
    }

    const duplicateCategoryCount = await this.countActiveSiblingsInCategory(sub);
    if (duplicateCategoryCount >= 2) {
      score += 20;
      reasons.push('Aynı kategoride birden fazla aktif abonelik');
    }

    if (sub.trialEndDate && isPast(sub.trialEndDate) && sub.status === 'active') {
      score += 15;
      reasons.push('Deneme süresi bitti, hâlâ ücretli devam ediyor');
    }

    return { subscriptionId: sub.id, score, isZombie: score >= 50, reasons };
  }
}
```

Bu servis, **haftalık bir BullMQ cron job'u** olarak çalışır (`@Cron(CronExpression.EVERY_WEEK)`), skoru `>= 50` olan abonelikler için `zombie_detected` bildirimi tetikler ve sonucu dashboard'da göstermek üzere `subscriptions` tablosuna (veya ayrı bir `zombie_scores` tablosuna) yazar.

---

## 4. API Tasarımı ve Güvenliği

### 4.1 API Yapısı: RESTful (önerilen)

REST'i öneriyoruz çünkü: (1) mobil istemci için önbellekleme (HTTP cache header'ları) daha doğal, (2) üçüncü parti entegrasyonlar (banka webhook'ları, Stripe vb.) REST/webhook standardına daha uyumlu, (3) OpenAPI/Swagger ile otomatik dokümantasyon NestJS'te native destekli.

**Uç nokta yapısı (özet):**

```
Auth
  POST   /auth/register
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout
  GET    /auth/oauth/google/callback
  GET    /auth/oauth/apple/callback

Kullanıcı
  GET    /users/me
  PATCH  /users/me
  PATCH  /users/me/notification-preferences

Abonelikler
  GET    /subscriptions                 ?status=active&category=&sharedAccountId=
  POST   /subscriptions
  GET    /subscriptions/:id
  PATCH  /subscriptions/:id
  DELETE /subscriptions/:id              (soft delete)
  POST   /subscriptions/:id/pause
  POST   /subscriptions/:id/resume
  POST   /subscriptions/:id/cancel
  GET    /subscriptions/:id/history

Kategoriler
  GET    /categories
  POST   /categories
  PATCH  /categories/:id
  DELETE /categories/:id

Ortak Hesaplar
  GET    /shared-accounts
  POST   /shared-accounts
  GET    /shared-accounts/:id
  POST   /shared-accounts/:id/members          (davet gönder)
  DELETE /shared-accounts/:id/members/:userId
  GET    /shared-accounts/:id/cost-splits
  POST   /shared-accounts/:id/cost-splits/:id/settle

Analitik
  GET    /analytics/burn-rate                  ?period=monthly|yearly
  GET    /analytics/zombie-subscriptions
  GET    /analytics/spending-by-category
  GET    /analytics/upcoming-renewals           ?days=7

Webhook (dahili — gelecek faz)
  POST   /webhooks/bank-transaction
```

### 4.2 Kimlik Doğrulama ve Yetkilendirme Stratejisi

**Akış:**

1. **Kayıt/Giriş** → `argon2id` ile parola hash'lenir (bcrypt'ten daha güvenli; memory-hard, GPU/ASIC saldırılarına dirençli).
2. Başarılı girişte **kısa ömürlü access token (JWT, 15 dk)** + **uzun ömürlü refresh token (7-30 gün, httpOnly secure cookie veya güvenli mobil depoda)** verilir.
3. Refresh token'lar veritabanında **hash'lenmiş** olarak saklanır (`refresh_tokens` tablosu) — çalınması durumunda tek bir token iptal edilebilir, tüm oturumlar değil.
4. **OAuth2** (Google/Apple Sign-In) — mobil-öncelikli bir uygulamada Apple Sign-In App Store zorunluluğu nedeniyle **şart**.

```typescript
// modules/auth/auth.service.ts (özet)
@Injectable()
export class AuthService {
  async register(dto: RegisterDto) {
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.usersRepo.create({ ...dto, passwordHash });
    return this.issueTokens(user);
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.usersRepo.findByEmail(email);
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException('Geçersiz kimlik bilgileri');
    }
    return user;
  }

  private async issueTokens(user: User) {
    const accessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: '15m' },
    );
    const refreshToken = crypto.randomBytes(64).toString('hex');
    await this.refreshTokensRepo.create({
      userId: user.id,
      tokenHash: await argon2.hash(refreshToken),
      expiresAt: addDays(new Date(), 30),
    });
    return { accessToken, refreshToken };
  }
}
```

**Yetkilendirme (Authorization) — kaynak sahipliği kontrolü:**

Ortak hesap özelliği nedeniyle basit "kullanıcı = kaynak sahibi" kontrolü yetersizdir. Her `shared_accounts` ve `subscriptions` erişiminde bir **Guard** rol kontrolü yapar:

```typescript
// common/guards/shared-account-role.guard.ts
@Injectable()
export class SharedAccountRoleGuard implements CanActivate {
  constructor(private reflector: Reflector, private membersRepo: SharedAccountMembersRepo) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
    const { user, params } = context.switchToHttp().getRequest();

    const membership = await this.membersRepo.findByAccountAndUser(
      params.sharedAccountId,
      user.id,
    );
    if (!membership) throw new ForbiddenException('Bu hesaba erişiminiz yok');
    if (requiredRoles && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok');
    }
    return true;
  }
}

// Kullanım:
@Roles('owner', 'admin')
@UseGuards(JwtAuthGuard, SharedAccountRoleGuard)
@Post('shared-accounts/:sharedAccountId/members')
inviteMember(@Param('sharedAccountId') id: string, @Body() dto: InviteMemberDto) {}
```

**Güvenlik sertleştirme (hardening) kontrol listesi:**

| Önlem | Uygulama |
|---|---|
| Rate limiting | `@nestjs/throttler` — auth uç noktalarında IP başına dakikada 5 istek |
| Girdi doğrulama | `class-validator` + DTO'larda whitelist (`forbidNonWhitelisted: true`) |
| SQL injection | Prisma parametrize sorgular (ORM native koruması) |
| CORS | Yalnızca bilinen mobil/web origin'lerine izin |
| Hassas veri loglama | Parola/token'lar log'larda maskelenir (`nestjs-pino` redact) |
| Refresh token rotasyonu | Her kullanımda eski token iptal edilir, yenisi verilir (token theft tespiti) |
| Şifreli veri | `payment_method` gibi hassas alanlar `pgcrypto` ile at-rest şifreleme (ileri faz) |
| Bağımlılık taraması | CI'da `npm audit` / Snyk otomasyonu |

---

## 5. Uygulama Yol Haritası (Faz Bazlı)

| Faz | Kapsam | Tahmini Süre |
|---|---|---|
| **Faz 0 — Temel** | Monorepo kurulumu (Turborepo), NestJS iskeleti, Prisma şema + migration, Docker Compose (Postgres+Redis), CI pipeline | 1 hafta |
| **Faz 1 — Kimlik ve Çekirdek CRUD** | Auth modülü (JWT+OAuth2), Kullanıcı profili, Abonelik CRUD, Kategori yönetimi | 2 hafta |
| **Faz 2 — Arka Plan İşleri** | BullMQ kurulumu, hatırlatıcı zamanlayıcı+işçi, push/e-posta entegrasyonu | 1.5 hafta |
| **Faz 3 — Ortak Hesaplar** | Shared accounts, davet akışı, cost-split hesaplama motoru | 2 hafta |
| **Faz 4 — Analitik** | Burn rate hesaplama, zombi abonelik skorlama motoru, dashboard uç noktaları | 1.5 hafta |
| **Faz 5 — Mobil/Web İstemci** | Expo uygulaması (paralel geliştirilebilir), TanStack Query entegrasyonu, push izinleri | 3-4 hafta (paralel) |
| **Faz 6 — Sertleştirme** | Rate limiting, güvenlik denetimi, yük testi (k6), gözlemlenebilirlik (Sentry+OTel) | 1.5 hafta |
| **Faz 7 — Beta ve Ölçekleme** | Kapalı beta, geri bildirim döngüsü, gerekirse okuma replikaları/CDN | Sürekli |

---

## 6. Sonraki Adımlar İçin Öneriler

1. Monorepo'yu (`apps/api`, `apps/mobile`, `packages/shared-types`) ve Prisma şemasını birlikte kurup ilk migration'ı çalıştırabilirim.
2. `SubscriptionsModule` için tam NestJS modül iskeletini (controller, service, DTO, Prisma repository) kod olarak üretebilirim.
3. BullMQ hatırlatıcı akışını uçtan uca çalışır bir örnekle (Docker Compose + gerçek job) gösterebilirim.

Hangisiyle devam etmek istersin?
