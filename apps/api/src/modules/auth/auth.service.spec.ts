import { Test } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshToken: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
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
    it('e-posta zaten kayıtlıysa ConflictException fırlatır', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

      await expect(
        service.register({ email: 'var@ornek.com', password: 'gizli123', fullName: 'Test' }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('yeni kullanıcıyı hash lenmiş parolayla oluşturur ve token çifti döner', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'new-user', email: 'yeni@ornek.com' });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.register({
        email: 'yeni@ornek.com',
        password: 'gizli123',
        fullName: 'Yeni Kullanıcı',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(typeof result.refreshToken).toBe('string');

      // Parolanın düz metin olarak değil, argon2 hash'i olarak kaydedildiğini doğrula.
      const createCall = prisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe('gizli123');
      expect(await argon2.verify(createCall.data.passwordHash, 'gizli123')).toBe(true);
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
      const correctHash = await argon2.hash('dogru-parola', { type: argon2.argon2id });
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
      const correctHash = await argon2.hash('dogru-parola', { type: argon2.argon2id });
      prisma.user.findFirst.mockResolvedValue({
        id: 'user-1',
        email: 'test@ornek.com',
        passwordHash: correctHash,
      });
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: 'test@ornek.com', password: 'dogru-parola' });

      expect(result.accessToken).toBe('mock-access-token');
      expect(typeof result.refreshToken).toBe('string');
    });
  });

  describe('refreshTokens', () => {
    it('geçersiz refresh token için UnauthorizedException fırlatır', async () => {
      prisma.refreshToken.findMany.mockResolvedValue([]);

      await expect(service.refreshTokens('gecersiz-token')).rejects.toThrow(UnauthorizedException);
    });

    it('geçerli token bulunduğunda eskisini iptal edip yenisini döner', async () => {
      const rawToken = 'gercek-refresh-token';
      const tokenHash = await argon2.hash(rawToken);
      prisma.refreshToken.findMany.mockResolvedValue([
        {
          id: 'rt-1',
          tokenHash,
          user: { id: 'user-1', email: 'test@ornek.com' },
        },
      ]);
      prisma.refreshToken.update.mockResolvedValue({});
      prisma.refreshToken.create.mockResolvedValue({});

      const result = await service.refreshTokens(rawToken);

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rt-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        }),
      );
      expect(result.accessToken).toBe('mock-access-token');
    });
  });
});
