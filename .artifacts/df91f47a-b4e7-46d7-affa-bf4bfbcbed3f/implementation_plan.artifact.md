# E-posta Doğrulama Akışı & OAuth Hesap Birleştirme Planı

Bu plan, parola ile kayıt olan kullanıcıların e-postalarını doğrulamasını (`emailVerifiedAt`), token tabanlı doğrulama uç noktasını ve aynı e-posta ile OAuth (Google/Apple) girişi yapıldığında hesapların güvenli bir şekilde birleştirilmesini sağlar.

## Kullanıcı İncelemesi Gerekenler

> [!IMPORTANT]
> Parola ile kayıt olan kullanıcılara ilk kayıt anında e-posta doğrulama token'ı üretilecek ve doğrulama bağlantısı sağlanacaktır. E-posta doğrulanana kadar `emailVerifiedAt` alanı `null` kalacak, doğrulandığı an set edilecektir.

## Önerilen Değişiklikler

### 1. Veritabanı Modeli & Şema (`schema.prisma`)
- `users` tablosuna `verification_token` ve `verification_token_expires_at` alanları eklenmesi (veya geçici token tablosu).

### 2. Auth Modülü (`AuthService` & `AuthController`)
- **Kayıt (`register`)**: `verificationToken` üretilmesi ve kaydedilmesi.
- **Doğrulama (`GET /auth/verify-email?token=...`)**: Token kontrolü, `emailVerifiedAt = new Date()` atanması ve token'ın temizlenmesi.
- **OAuth Birleştirme (`validateOAuthLogin`)**: E-posta eşleştiğinde `emailVerifiedAt` kontrolü ve hesap bağlama akışı.

## Doğrulama Planı

### Otomatik Testler
- Yeni e-posta doğrulama birim ve E2E testleri (`auth.e2e-spec.ts`).
