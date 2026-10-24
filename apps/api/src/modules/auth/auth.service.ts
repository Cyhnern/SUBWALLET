import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { addDays, subDays } from 'date-fns';
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

  private hashSecret(s: string): string {
    return crypto.createHash('sha256').update(s).digest('hex');
  }

  private safeEqualHex(a: string, b: string): boolean {
    if (!a || !b) return false;
    const x = Buffer.from(a, 'hex');
    const y = Buffer.from(b, 'hex');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  }

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
            emailVerifiedAt: new Date(),
          },
        });
      }
    }

    return this.issueTokenPair(user.id, user.email);
  }

  /** Refresh token rotasyonu: kaydı bul, hash'i doğrula, süre ve kullanıcı aktifliğini kontrol et, revokedAt kontrolü ve atomik updateMany ile race condition / çalıntı token koruması. */
  async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
    const [id, secret] = (rawRefreshToken || '').split('.');
    if (!id || !secret) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!tokenRecord || !tokenRecord.user) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

    // 1. Hash ve süre doğrulaması
    const isExpired = tokenRecord.expiresAt <= new Date();
    const isSecretValid = this.safeEqualHex(tokenRecord.tokenHash, this.hashSecret(secret));

    if (isExpired || !isSecretValid) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

    // 2. Kullanıcı aktiflik kontrolü
    if (!tokenRecord.user.isActive || tokenRecord.user.deletedAt) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

    // 3. Token Theft Detection: revokedAt doluysa tüm oturumları iptal et ve hata ver (çalıntı token şüphesi)
    if (tokenRecord.revokedAt) {
      await this.revokeAllSessions(tokenRecord.userId);
      throw new UnauthorizedException(
        'Şüpheli hareket tespit edildi: Kullanılmış token tekrar denendi, tüm oturumlar kapatıldı.',
      );
    }

    // 4. Atomik iptal / rotasyon
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      await this.revokeAllSessions(tokenRecord.userId);
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

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
      this.safeEqualHex(tokenRecord.tokenHash, this.hashSecret(secret))
    ) {
      await this.prisma.refreshToken.update({
        where: { id: tokenRecord.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'UTC' })
  async purgeStaleRefreshTokens() {
    await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: subDays(new Date(), 7) } },
        ],
      },
    });
  }

  async purgeExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revokedAt: { lt: subDays(new Date(), 7) } },
        ],
      },
    });
    return result.count;
  }

  private async issueTokenPair(userId: string, email: string): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );

    const secret = crypto.randomBytes(48).toString('base64url');
    const tokenHash = this.hashSecret(secret);
    const refreshDays = Number(this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS', 30));

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: addDays(new Date(), refreshDays),
      },
    });

    const refreshToken = `${record.id}.${secret}`;
    return { accessToken, refreshToken };
  }
}
