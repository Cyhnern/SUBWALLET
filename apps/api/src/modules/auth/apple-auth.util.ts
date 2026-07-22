import appleSignin from 'apple-signin-auth';

export interface AppleVerifiedProfile {
  provider: 'apple';
  providerId: string;
  email: string;
}

/**
 * Mobil istemci (Expo AppleAuthentication) Apple'dan aldığı identityToken'ı
 * doğrudan backend'e gönderir; web'deki gibi bir yönlendirme (redirect) akışına
 * gerek yoktur. Bu fonksiyon token'ın imzasını Apple'ın genel anahtarlarıyla doğrular.
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  clientId: string,
): Promise<AppleVerifiedProfile> {
  const result = await appleSignin.verifyIdToken(identityToken, {
    audience: clientId,
    ignoreExpiration: false,
  });

  if (!result.email) {
    throw new Error('Apple token içinde e-posta bulunamadı');
  }

  return {
    provider: 'apple',
    providerId: result.sub,
    email: result.email,
  };
}
