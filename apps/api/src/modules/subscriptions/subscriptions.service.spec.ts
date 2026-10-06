import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../../common/prisma/prisma.service';

// PrismaService'in ihtiyaç duyulan metodlarının sahte (mock) sürümü.
// Gerçek bir veritabanına bağlanmadan iş mantığını izole test etmemizi sağlar.
const createMockPrisma = () => ({
  subscription: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  subscriptionHistory: {
    create: jest.fn(),
  },
  sharedAccountMember: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn((cb: any) => cb(createMockPrisma())),
});

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();
    // $transaction çağrıldığında gerçek prisma mock'unu callback'e verelim ki
    // içindeki tx.subscription.update / tx.subscriptionHistory.create çağrıları izlenebilsin.
    prisma.$transaction.mockImplementation((cb: any) => cb(prisma));

    const module = await Test.createTestingModule({
      providers: [SubscriptionsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SubscriptionsService);
  });

  describe('transitionStatus', () => {
    it('active -> paused geçişine izin verir ve geçmişe kaydeder', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        status: 'active',
        sharedAccountId: null,
      });
      prisma.subscription.update.mockResolvedValue({ id: 'sub-1', status: 'paused' });

      const result = await service.transitionStatus('user-1', 'sub-1', 'paused');

      expect(result.status).toBe('paused');
      expect(prisma.subscriptionHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscriptionId: 'sub-1',
            changedField: 'status',
            oldValue: 'active',
            newValue: 'paused',
          }),
        }),
      );
    });

    it('cancelled -> active geçişini reddeder (izin verilmeyen geçiş)', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-2',
        userId: 'user-1',
        status: 'cancelled',
        sharedAccountId: null,
      });

      await expect(service.transitionStatus('user-1', 'sub-2', 'active')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.subscription.update).not.toHaveBeenCalled();
    });

    it('başkasına ait ve ortak hesaba bağlı olmayan aboneliğe erişimi reddeder', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-3',
        userId: 'baska-kullanici',
        status: 'active',
        sharedAccountId: null,
      });

      await expect(service.transitionStatus('user-1', 'sub-3', 'paused')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('var olmayan abonelik için NotFoundException fırlatır', async () => {
      prisma.subscription.findFirst.mockResolvedValue(null);

      await expect(service.transitionStatus('user-1', 'yok', 'paused')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('cancelled durumundan hiçbir duruma geçişe izin vermez', async () => {
      prisma.subscription.findFirst.mockResolvedValue({
        id: 'sub-4',
        userId: 'user-1',
        status: 'cancelled',
        sharedAccountId: null,
      });

      await expect(service.transitionStatus('user-1', 'sub-4', 'paused')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('create', () => {
    it('ortak hesaba üye olmayan kullanıcının o hesaba abonelik eklemesini engeller', async () => {
      prisma.sharedAccountMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', {
          price: 9.99,
          currency: 'USD',
          billingCycle: 'monthly',
          startDate: '2026-07-01',
          sharedAccountId: 'shared-1',
        } as any),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('geçerli girdiyle aboneliği oluşturur ve next_billing_date hesaplar', async () => {
      prisma.subscription.create.mockResolvedValue({ id: 'sub-5' });

      await service.create('user-1', {
        price: 9.99,
        currency: 'USD',
        billingCycle: 'monthly',
        startDate: '2026-07-01',
      } as any);

      expect(prisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            status: 'active', // trialEndDate verilmediği için doğrudan active
          }),
        }),
      );
    });
  });
});
