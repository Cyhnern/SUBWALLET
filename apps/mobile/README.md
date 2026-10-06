# Subwallet Mobile (Expo)

Backend'e bağlanan React Native/Expo istemcisi. Auth (giriş/kayıt), abonelik listesi,
yeni abonelik ekleme ve analiz (burn rate + zombi abonelikler) ekranlarını içerir.

## Kurulum

```bash
cd apps/mobile
npm install
```

### 1. Backend'in çalıştığından emin ol

Kök dizinde `docker compose up -d` ve `npm run dev` (apps/api) çalışıyor olmalı.

### 2. Bilgisayarının yerel ağ IP'sini bul

Telefon, `localhost` üzerinden bilgisayarındaki API'ye ulaşamaz — bilgisayarının
yerel ağ IP'sini kullanman gerekiyor.

**Windows:**
```cmd
ipconfig
```
"IPv4 Address" satırındaki değeri not al (örn. `192.168.1.42`).

**Mac/Linux:**
```bash
ifconfig | grep "inet "
```

### 3. API adresini ayarla

`src/api/config.ts` dosyasını aç, `API_BASE_URL`'i kendi IP'ne göre güncelle:

```ts
export const API_BASE_URL = 'http://192.168.1.42:3000/api/v1';
```

### 4. Geliştirme sunucusunu başlat

```bash
npx expo start
```

Terminalde bir QR kod çıkacak. Telefonunda **Expo Go** uygulamasını aç (Android: Play Store,
iOS: App Store), QR kodu okut. Telefon ve bilgisayar **aynı Wi-Fi ağında** olmalı.

## Sorun Giderme

**"Network request failed" / bağlantı hatası**
- Bilgisayarın ve telefonun aynı Wi-Fi'de olduğundan emin ol.
- `API_BASE_URL`'deki IP'nin doğru olduğunu doğrula (`ipconfig` ile tekrar kontrol et — ev
  ağlarında IP zaman zaman değişebilir).
- Windows Güvenlik Duvarı, 3000 portuna gelen yerel ağ bağlantılarını engelliyor olabilir;
  ilk bağlantı denemesinde Windows bir izin penceresi gösterirse "İzin Ver" de.
- Backend'in gerçekten çalıştığını doğrulamak için telefonun tarayıcısından
  `http://<bilgisayar-ip>:3000/docs` adresini açmayı dene — Swagger açılıyorsa ağ bağlantısı sorunsuz demektir.

**Expo Go'da beyaz ekran / hata**
- Terminaldeki hata mesajına bak, genelde eksik bir paket ya da import hatasıdır.
- `npx expo start -c` ile cache temizleyerek yeniden dene.

## Dizin Yapısı

```
app/                    Expo Router route'ları (dosya = ekran)
  (auth)/login.tsx        Giriş ekranı
  (auth)/register.tsx     Kayıt ekranı
  (tabs)/index.tsx         Abonelik listesi
  (tabs)/dashboard.tsx     Burn rate + zombi abonelikler
  (tabs)/profile.tsx       Profil + çıkış
  add-subscription.tsx     Yeni abonelik ekleme (modal)
src/
  api/                    Backend ile iletişim (fetch wrapper, auth, subscriptions, analytics)
  context/AuthContext.tsx  Uygulama genelinde oturum durumu
  components/              Paylaşılan UI bileşenleri
  theme.ts                 Renk sabitleri
```

## Henüz Yapılmayanlar

- Ortak hesap (SharedAccounts) ekranları
- Kategori seçimi (şu an tüm yeni abonelikler kategorisiz ekleniyor)
- Google/Apple ile giriş (backend hazır, mobil tarafta buton yok)
- Push bildirim izni isteme ve token'ı backend'e gönderme
