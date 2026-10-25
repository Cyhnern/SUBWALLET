import { Test } from '@nestjs/testing';
import { subDays } from 'date-fns';
import { ZombieDetectorService } from './zombie-detector.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const baseSubscription = {
  id: 'sub-1',
  userId: 'user-1',
  status: 'active',
  categoryId: null,
  trialEndDate: null,
  lastUsedAt: null,
  startDate: new Date(),
  customName: 'Netflix',
};

describe('ZombieDetectorService', () => {
  let service: ZombieDetectorService;
  let prisma: any;
  let notifications: any;

  beforeEach(async () => {
    prisma = {
      subscriptionHistory: { findMany: jest.fn().mockResolvedValue([]) },
      subscription: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
    };
    notifications = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ZombieDetectorService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get(ZombieDetectorService);
  });

  it('hiçbir sinyal yoksa skor 0 ve zombi değil olarak döner', async () => {
    const result = await service.scoreSubscription({
      ...baseSubscription,
      lastUsedAt: new Date(),
      startDate: new Date(),
    } as any);

    expect(result.score).toBe(0);
    expect(result.isZombie).toBe(false);
    expect(result.name).toBe('Netflix');
  });

  it('30+ gündür kullanılmayan abonelik tek başına eşiği aşamaz ama skor alır', async () => {
    const result = await service.scoreSubscription({
      ...baseSubscription,
      lastUsedAt: subDays(new Date(), 45),
      startDate: subDays(new Date(), 60),
    } as any);

    expect(result.score).toBe(40);
    expect(result.isZombie).toBe(false);
    expect(result.reasons).toContain('30+ gündür kullanılmadı');
  });

  it('kullanılmama + fiyat artışı birlikte eşiği aşıp zombi olarak işaretler', async () => {
    prisma.subscriptionHistory.findMany.mockResolvedValue([
      { oldValue: '10', newValue: '13' },
    ]);

    const result = await service.scoreSubscription({
      ...baseSubscription,
      lastUsedAt: subDays(new Date(), 60),
      startDate: subDays(new Date(), 90),
    } as any);

    expect(result.score).toBe(65);
    expect(result.isZombie).toBe(true);
    expect(result.reasons).toHaveLength(2);
  });

  it('hiç kullanılmamış (lastUsedAt null) ve startDate üzerinden 30+ gün geçmiş abonelik inaktiflik sinyali alır', async () => {
    const result = await service.scoreSubscription({
      ...baseSubscription,
      lastUsedAt: null,
      startDate: subDays(new Date(), 35),
    } as any);

    expect(result.score).toBeGreaterThanOrEqual(40);
  });

  it('deneme süresi bitmiş ama hâlâ aktif olan abonelik ek puan alır', async () => {
    const result = await service.scoreSubscription({
      ...baseSubscription,
      lastUsedAt: new Date(),
      startDate: new Date(),
      trialEndDate: subDays(new Date(), 5),
      status: 'active',
    } as any);

    expect(result.score).toBe(15);
    expect(result.reasons).toContain('Deneme süresi bitti, hâlâ ücretli devam ediyor');
  });

  it('aynı kategoride başka aktif abonelik varsa mükerrer sinyali ekler', async () => {
    prisma.subscription.count.mockResolvedValue(1);

    const result = await service.scoreSubscription({
      ...baseSubscription,
      categoryId: 'cat-muzik',
      lastUsedAt: new Date(),
      startDate: new Date(),
    } as any);

    expect(result.score).toBe(20);
    expect(result.reasons).toContain('Aynı kategoride birden fazla aktif abonelik');
  });
});
