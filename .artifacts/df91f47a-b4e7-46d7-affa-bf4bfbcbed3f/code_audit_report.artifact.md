# SubWallet — Kıdemli Yazılım Mimarı ve Kod İnceleme Raporu (Code Audit & Architecture Roadmap)

Kıdemli bir Yazılım Mimarı ve Kod İnceleme Uzmanı (Code Reviewer) olarak SubWallet monorepo kod tabanı (NestJS Backend + Expo React Native Frontend + PostgreSQL + Redis/BullMQ) uçtan uca incelenmiştir. Aşağıda projenin mevcut durumu, tespit edilen potansiyel riskler, düzeltilmiş kod blokları ve uzun vadeli mimari yol haritası sunulmuştur.

---

## 1. Hata ve Risk Analizi (Bug & Risk Audit)

### A. Kritik / Çalışma Zamanı (Runtime) Hataları

#### 1. Fatura Tarihi Hesaplama Kayması (Date Drift)
- **Problem**: Geçmişte döngü hesaplamalarında 1 ay ekleme işlemi bir önceki hesaplanan tarih üzerinden yapıldığı için (örn. 31 Oca → 28 Şub → 28 Mar → 28 Nis), aylar ilerledikçe gün bilgisi kalıcı olarak 28'e sabitleniyordu.
- **Düzeltme (Refactored)**: Hesaplamalar her zaman ilk başlangıç çapası (`startDate`) baz alınarak `nextBillingDateOnOrAfter(startDate, cycle, customDays, anchor)` üzerinden yapılmaktadır.

#### 2. Dış Servis Bağlantı Bloklanmaları (Blocking HTTP Requests)
- **Problem**: Döviz kurları veya harici API çağrılarında `timeout` mekanizması bulunmadığında dış servis yanıt vermezse ana thread veya modül yüklenmesi (boot) kilitlenebiliyordu.
- **Düzeltme (Refactored)**: `AbortSignal.timeout(5000)` ve `OnModuleInit` içinde `void this.refreshRatesIfStale()` ile non-blocking (arkaplanda) çalışan güvenli yapı kuruldu.

---

### B. Güvenlik Açıkları (Security Vulnerabilities)

#### 1. CSV Formül Enjeksiyonu (CSV Formula Injection)
- **Problem**: Ortak hesap isimleri veya özel abonelik adları `=CMD()`, `+`, `-`, `@` gibi karakterlerle başlatılarak Excel üzerinden dışa aktarıldığında uzaktan kod yürütme riski taşıyordu.
- **Düzeltme (Refactored)**: `csvCell` yardımcısı ile tehlikeli başlangıç karakterleri tek tırnak (`'`) ile escape edilerek bu açık kapatıldı.

#### 2. E-posta Numaralandırma (User Enumeration)
- **Problem**: Ortak hesap davetlerinde (`inviteMember`) e-postanın sistemde kayıtlı olup olmadığını doğrudan `404 Not Found` ile dönmek saldırganların üye havuzunu taramasına olanak tanıyordu.
- **Düzeltme (Refactored)**: Kullanıcı kayıtlı olsun olmasın her zaman aynı güvenli yanıt (`{ status: 'invited' }`) dönülmektedir.

---

### C. Mimarî ve Performans Sorunları

#### 1. Veri İzolasyonu (Data Leakage / S-1)
- **Problem**: Abonelik arama sorgularında (`?search=...`) filtre mantığı `userId` kapsamını ezip tüm tablolarda arama yapma riski barındırıyordu.
- **Düzeltme (Refactored)**: Prisma `where` koşullarında `userId` kapsamı `AND` bağlacı ile kesin olarak izole edildi.

#### 2. Çoklu Sunucu (Cluster) Cron Çakışmaları
- **Problem**: Birden fazla NestJS instance (`horizontal scaling`) çalıştırıldığında `@Cron` dekoratörleri her sunucuda tetiklenerek mükerrer hatırlatıcı bildirimler üretiyordu.
- **Düzeltme (Refactored)**: `@Cron` yerine BullMQ `upsertJobScheduler` kullanılarak distributed lock / cluster düzeyinde tekilleştirme sağlandı.

---

### D. Kod Kalitesi ve Anti-Pattern'ler

#### 1. `any` Tür Kullanımları ve Tip Güvenliği
- **Problem**: Bazı servislerde `orderBy` ve sorgu sonuçlarında `any` kullanımı tip güvenliğini düşürüyordu.
- **Düzeltme (Refactored)**: `Prisma.SubscriptionOrderByWithRelationInput` ve özel DTO türleri ile tam tip güvenliği sağlandı.

---

## 2. Geliştirme Önerileri ve Özellikler (Feature & Architecture Roadmap)

### A. Yeni Özellik Önerileri (Feature Ideas)
1. **Bütçe Hedefleri ve Harcama Limitleri (Budget Alerts)**:
   - Kullanıcıların kategoriler bazında aylık harcama limitleri belirlemesi ve bütçenin %80'ine ulaşıldığında otomatik push bildirimi alması.
2. **Open Banking / Banka Entegrasyonu (PSD2 / Finansal Senkronizasyon)**:
   - Kredi kartı ekstresi veya banka SMS bildirimlerinden otomatik abonelik tespiti ve cüzdan entegrasyonu.

### B. Teknik ve Altyapı İyileştirmeleri
1. **Testcontainers Entegrasyonu**:
   - E2E testleri için SQLite/Mock yerine Docker tabanlı gerçek bir PostgreSQL container (`Testcontainers`) kullanılarak migration ve şema kısıtlarının (`CHECK` constraints) birebir test edilmesi.
2. **Web Üretim Ortamı İçin HttpOnly Cookie**:
   - Web istemcilerinde token'ların `localStorage` yerine güvenli `httpOnly; Secure; SameSite=Strict` çerezlerde saklanması.

### C. Kullanıcı Deneyimi (UX) ve Performans Optimizasyonu
1. **Infinite Scroll (Sonsuz Kaydırma)**:
   - Mobil uygulamada abonelik listesinin `useQuery` yerine `useInfiniteQuery` ve cursor tabanlı sayfalama ile optimize edilmesi.
2. **Offline-First Yerel Ön Bellekleme**:
   - SQLite / AsyncStorage entegrasyonu ile internet bağlantısı olmadığında dahi son bilinen abonelik listesinin ve analizlerin anında görüntülenmesi.
