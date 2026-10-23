import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { addDays } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Bu bilgilerle kayıt tamamlanamadı');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, fullName: dto.fullName },
    });

    return this.issueTokenPair(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findFirst({
      where: { email: dto.email, deletedAt: null, isActive: true },
    });

    const DUMMY_HASH =
      '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const passwordHash = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await argon2.verify(passwordHash, dto.password).catch(() => false);

    if (!user || !user.passwordHash || !isValid) {
      throw new UnauthorizedException('Geçersiz e-posta veya parola');
    }

    return this.issueTokenPair(user.id, user.email);
  }

  /** Google/Apple gibi bir sağlayıcıdan doğrulanmış profil ile giriş/kayıt. */
  async validateOAuthLogin(profile: OAuthProfile): Promise<TokenPair> {
    let user = await this.prisma.user.findUnique({
      where: {
        oauthProvider_oauthProviderId: {
          oauthProvider: profile.provider,
          oauthProviderId: profile.providerId,
        },
      },
    });

    if (!user) {
      // Aynı e-posta ile daha önce parolayla kayıt olunmuş olabilir — e-posta doğrulanmışsa birleştir.
      const existingUser = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existingUser) {
        if (!existingUser.emailVerifiedAt) {
          throw new UnauthorizedException(
            'Hesap birleştirme başarısız: Mevcut hesabın e-posta adresi doğrulanmamış.',
          );
        }
        user = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { oauthProvider: profile.provider, oauthProviderId: profile.providerId },
        });
      } else {
        user = await this.prisma.user.create({
          data: {
            email: profile.email,
            fullName: profile.fullName ?? profile.email.split('@')[0],
            avatarUrl: profile.avatarUrl,
            oauthProvider: profile.provider,
            oauthProviderId: profile.providerId,
            emailVerifiedAt: new Date(), // OAuth sağlayıcısı doğrulanmış e-posta sundu
          },
        });
      }
    }

    return this.issueTokenPair(user.id, user.email);
  }

  /** Refresh token rotasyonu: id.secret formatı ile O(1) doğrudan tek sorgulu arama. */
  async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
    const [id, secret] = (rawRefreshToken || '').split('.');
    if (!id || !secret) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { id },
      include: { user: true },
    });

    if (
      !tokenRecord ||
      tokenRecord.revokedAt ||
      tokenRecord.expiresAt <= new Date() ||
      !(await argon2.verify(tokenRecord.tokenHash, secret).catch(() => false))
    ) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

    // Rotasyon: eskisini iptal et, yenisini oluştur (token theft tespiti için).
    await this.prisma.refreshToken.update({
      where: { id: tokenRecord.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(tokenRecord.user.id, tokenRecord.user.email);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const [id, secret] = (rawRefreshToken || '').split('.');
    if (!id || !secret) return;

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { id },
    });

    if (
      tokenRecord &&
      !tokenRecord.revokedAt &&
      (await argon2.verify(tokenRecord.tokenHash, secret).catch(() => false))
    ) {
      await this.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  /** Kullanıcının tüm oturumlarını kapatır (ör. "diğer cihazlardan çıkış yap"). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );

    const secret = crypto.randomBytes(64).toString('hex');
    const refreshDays = Number(this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS', 30));

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: await argon2.hash(secret),
        expiresAt: addDays(new Date(), refreshDays),
      },
    });

    const refreshToken = `${record.id}.${secret}`;
    return { accessToken, refreshToken };
  }
}
