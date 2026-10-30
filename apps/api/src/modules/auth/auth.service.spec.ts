import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';

function sha256(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('mock-access-token') } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
            get: jest.fn((key: string, def?: any) => def ?? 'test-value'),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  describe('register', () => {
    it('e-posta zaten kayıtlıysa P2002 hatasını yakalayıp ConflictException fırlatır', async () => {
      const p2002Err = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      });
      prisma.user.create.mockRejectedValue(p2002Err);

      await expect(
        service.register({ email: 'var@ornek.com', password: 'SuperGizli123!', fullName: 'Test' }),
      ).rejects.toThrow(ConflictException);
    });

    it('yeni kullanıcıyı hash lenmiş parolayla oluşturur ve token çifti döner', async () => {
      prisma.user.create.mockResolvedValue({ id: 'new-user', email: 'yeni@ornek.com' });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.register({
        email: 'yeni@ornek.com',
        password: 'SuperGizli123!',
        fullName: 'Yeni Kullanıcı',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toContain('rt-1.');

      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe('SuperGizli123!');
      expect(await argon2.verify(createCall.data.passwordHash, 'SuperGizli123!')).toBe(true);
    });
  });

  describe('login', () => {
    it('kullanıcı yoksa dahi jenerik UnauthorizedException fırlatır (bilgi sızdırmaz)', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.login({ email: 'yok@ornek.com', password: 'her-sey-olur' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('yanlış parolada UnauthorizedException fırlatır', async () => {
      const correctHash = await argon2.hash('SuperGizli123!', { type: argon2.argon2id });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@ornek.com',
        passwordHash: correctHash,
      });

      await expect(
        service.login({ email: 'test@ornek.com', password: 'yanlis-parola' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('doğru bilgilerle token çifti döner', async () => {
      const correctHash = await argon2.hash('SuperGizli123!', { type: argon2.argon2id });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@ornek.com',
        passwordHash: correctHash,
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-1' });

      const result = await service.login({ email: 'test@ornek.com', password: 'SuperGizli123!' });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toContain('rt-1.');
    });
  });

  describe('validateOAuthLogin', () => {
    it('mevcut kullanıcı varsa OAuth ile birleştirir ve e-postasını doğrulanmış kabul eder', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'user-1', email: 'test@ornek.com', emailVerifiedAt: null });
      prisma.user.update.mockResolvedValue({
        id: 'user-1',
        email: 'test@ornek.com',
        emailVerifiedAt: new Date(),
        isActive: true,
        deletedAt: null,
      });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.validateOAuthLogin({
        provider: 'google',
        providerId: 'google-123',
        email: 'test@ornek.com',
      });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({ oauthProvider: 'google', oauthProviderId: 'google-123' }),
        }),
      );
      expect(result.accessToken).toBe('mock-access-token');
    });
  });

  describe('refreshTokens', () => {
    it('geçersiz formatlı refresh token için UnauthorizedException fırlatır', async () => {
      await expect(service.refreshTokens('gecersiz-token')).rejects.toThrow(UnauthorizedException);
    });

    it('iptal edilmiş token tekrar denendiğinde çalınma riski algılayıp tüm oturumları kapatır', async () => {
      const secret = crypto.randomBytes(48).toString('base64url');
      const tokenHash = sha256(secret);
      const rawToken = `rt-1.${secret}`;

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: new Date(),
        userId: 'user-1',
        user: { id: 'user-1', email: 'test@ornek.com', isActive: true, deletedAt: null },
      });

      await expect(service.refreshTokens(rawToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });

    it('geçerli token bulunduğunda atomik olarak eskisini iptal edip yenisini döner (SHA-256 + updateMany)', async () => {
      const secret = crypto.randomBytes(48).toString('base64url');
      const tokenHash = sha256(secret);
      const rawToken = `rt-1.${secret}`;

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        tokenHash,
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
        userId: 'user-1',
        user: { id: 'user-1', email: 'test@ornek.com', isActive: true, deletedAt: null },
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt-2' });

      const result = await service.refreshTokens(rawToken);

      expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
        where: { id: 'rt-1' },
        include: { user: true },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { id: 'rt-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toContain('rt-2.');
    });
  });
});
