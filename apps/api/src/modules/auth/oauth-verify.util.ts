import { UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';

export interface VerifiedOAuthProfile {
  provider: 'google' | 'apple';
  providerId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
}

export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<VerifiedOAuthProfile> {
  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({
      idToken,
      audience: clientId,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      throw new UnauthorizedException('Google kimlik doğrulama başarısız: e-posta bulunamadı');
    }

    if (!payload.email_verified) {
      throw new UnauthorizedException('Google hesabı e-posta adresi doğrulanmamış');
    }

    return {
      provider: 'google',
      providerId: payload.sub,
      email: payload.email,
      fullName: payload.name,
      avatarUrl: payload.picture,
    };
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    throw new UnauthorizedException('Geçersiz veya süresi dolmuş Google kimlik tokenı');
  }
}

export async function verifyAppleIdToken(
  identityToken: string,
  clientId: string,
): Promise<VerifiedOAuthProfile> {
  try {
    const result = await appleSignin.verifyIdToken(identityToken, {
      audience: clientId,
      ignoreExpiration: false,
    });

    if (!result.email) {
      throw new UnauthorizedException('Apple kimlik doğrulama başarısız: e-posta bulunamadı');
    }

    if ((result as any).email_verified === false) {
      throw new UnauthorizedException('Apple hesabı e-posta adresi doğrulanmamış');
    }

    return {
      provider: 'apple',
      providerId: result.sub,
      email: result.email,
    };
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    throw new UnauthorizedException('Geçersiz veya süresi dolmuş Apple kimlik tokenı');
  }
}
