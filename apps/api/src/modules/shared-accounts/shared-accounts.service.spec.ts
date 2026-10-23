import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
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
      costSplit: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        SharedAccountsService,
        { provide: PrismaService, useValue: prisma },
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
    it('kayıtlı olmayan e-postada NotFoundException fırlatır', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.inviteMember('sa-1', { email: 'yok@ornek.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('zaten üye olan kullanıcıda ConflictException fırlatır', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: 'user-2' });
      prisma.sharedAccountMember.findUnique.mockResolvedValue({ id: 'm-1' });

      await expect(
        service.inviteMember('sa-1', { email: 'uye@ornek.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('recomputeCostSplits', () => {
    it('settled (ödenmiş) kayıtları dondurur ve üzerine yazılmasını engeller', async () => {
      const now = new Date();
      prisma.sharedAccount.findUnique.mockResolvedValue({
        id: 'sa-1',
        members: [{ userId: 'user-1' }, { userId: 'user-2' }],
        subscriptions: [{ id: 'sub-1', status: 'active', price: 100 }],
      });

      prisma.costSplit.findUnique
        .mockResolvedValueOnce({ id: 'cs-1', isSettled: true })
        .mockResolvedValueOnce(null);

      prisma.costSplit.upsert.mockResolvedValue({ id: 'cs-2', computedAmount: '50' });

      const results = await service.recomputeCostSplits('sa-1', now);

      expect(results).toHaveLength(2);
      expect(results[0].isSettled).toBe(true);
      expect(prisma.costSplit.upsert).toHaveBeenCalledTimes(1);
    });
  });
});
