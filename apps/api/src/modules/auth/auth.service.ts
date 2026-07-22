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
      // Bilgi sızdırmamak için jenerik mesaj — "bu e-posta kayıtlı" demek
      // saldırganlara hangi e-postaların sistemde olduğunu keşfetme imkanı verir.
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

    // Kullanıcı bulunamasa bile argon2.verify benzeri bir gecikme oluşturmak
    // için sabit bir hash'e karşı doğrulama yapılır (timing attack'ı zorlaştırır).
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
      // Aynı e-posta ile daha önce parolayla kayıt olunmuş olabilir — hesapları birleştir.
      user = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
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
            emailVerifiedAt: new Date(), // OAuth sağlayıcısı zaten doğruladı
          },
        });
      }
    }

    return this.issueTokenPair(user.id, user.email);
  }

  /** Refresh token rotasyonu: eski token her zaman iptal edilir, yenisi verilir. */
  async refreshTokens(rawRefreshToken: string): Promise<TokenPair> {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    // Token'lar hash'lenmiş saklandığı için doğrudan WHERE ile aranamaz;
    // adaylar üzerinde argon2.verify ile eşleştirilir. Üretimde token'ın
    // ilk N karakteri ayrı bir aranabilir kolonda tutularak bu O(n) tarama
    // O(1)'e indirgenebilir (lookup prefix pattern).
    let matched: (typeof candidates)[number] | undefined;
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.tokenHash, rawRefreshToken).catch(() => false)) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş refresh token');
    }

    // Rotasyon: eskisini iptal et, yenisini oluştur (token theft tespiti için).
    await this.prisma.refreshToken.update({
      where: { id: matched.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokenPair(matched.user.id, matched.user.email);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const candidates = await this.prisma.refreshToken.findMany({
      where: { revokedAt: null },
    });
    for (const candidate of candidates) {
      if (await argon2.verify(candidate.tokenHash, rawRefreshToken).catch(() => false)) {
        await this.prisma.refreshToken.update({
          where: { id: candidate.id },
          data: { revokedAt: new Date() },
        });
        break;
      }
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

    const refreshToken = crypto.randomBytes(64).toString('hex');
    const refreshDays = Number(this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS', 30));

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: await argon2.hash(refreshToken),
        expiresAt: addDays(new Date(), refreshDays),
      },
    });

    return { accessToken, refreshToken };
  }
}
