import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SharedAccountsService } from './shared-accounts.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('SharedAccountsService', () => {
  let service: SharedAccountsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      sharedAccount: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
      user: { findFirst: jest.fn() },
      sharedAccountMember: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn() },
      sharedAccountInvite: { upsert: jest.fn() },
      costSplit: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), findMany: jest.fn(), createMany: jest.fn(), updateMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module = await Test.createTestingModule({
      providers: [
        SharedAccountsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
      ],
    }).compile();

    service = module.get(SharedAccountsService);
  });

  describe('create', () => {
    it('yeni ortak hesabı sahibiyle birlikte oluşturur', async () => {
      prisma.sharedAccount.create.mockResolvedValue({ id: 'sa-1', name: 'Ev Grubu' });
      const result = await service.create('user-1', { name: 'Ev Grubu' });
      expect(result.id).toBe('sa-1');
    });
  });

  describe('inviteMember', () => {
    it('güvenli davet akışı için enum/status döner ve e-posta numaralandırmayı önler', async () => {
      prisma.sharedAccountInvite.upsert.mockResolvedValue({ id: 'inv-1' });

      const result = await service.inviteMember('sa-1', { email: 'arkadas@ornek.com' });
      expect(result).toEqual({
        status: 'invited',
        message: 'Eğer bu e-posta sistemde kayıtlıysa davet gönderildi',
      });
    });
  });

  describe('recomputeCostSplits & cent distribution', () => {
    it('3 üyeli hesapta 10.00 TL tutarlı aboneliği 3.34 / 3.33 / 3.33 olarak kuruş hassasiyetinde böler', async () => {
      const now = new Date();
      prisma.sharedAccount.findUnique.mockResolvedValue({
        id: 'sa-1',
        members: [
          { userId: 'user-1', joinedAt: new Date('2026-01-01') },
          { userId: 'user-2', joinedAt: new Date('2026-01-02') },
          { userId: 'user-3', joinedAt: new Date('2026-01-03') },
        ],
        subscriptions: [{ id: 'sub-1', status: 'active', price: 10 }],
      });

      prisma.costSplit.findMany.mockResolvedValue([
        { userId: 'user-1', computedAmount: '3.34' },
        { userId: 'user-2', computedAmount: '3.33' },
        { userId: 'user-3', computedAmount: '3.33' },
      ]);

      const results = await service.recomputeCostSplits('sa-1', now);

      expect(results).toHaveLength(3);
      expect(results[0].computedAmount).toBe('3.34');
      expect(results[1].computedAmount).toBe('3.33');
      expect(results[2].computedAmount).toBe('3.33');
      expect(prisma.costSplit.createMany).toHaveBeenCalledTimes(1);
    });
  });
});
