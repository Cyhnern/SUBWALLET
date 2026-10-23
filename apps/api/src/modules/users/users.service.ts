import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        baseCurrency: true,
        timezone: true,
        oauthProvider: true,
        emailVerifiedAt: true,
        createdAt: true,
        notificationPreference: true,
      },
    });
  }

  async updateMe(userId: string, dto: UpdateUserDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        baseCurrency: true,
        timezone: true,
      },
    });
  }

  async updateNotificationPreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        channels: dto.channels ?? ['push'],
        daysBeforeRenewal: dto.daysBeforeRenewal ?? [3, 1],
        zombieAlertsEnabled: dto.zombieAlertsEnabled ?? true,
      },
      update: {
        ...(dto.channels ? { channels: dto.channels } : {}),
        ...(dto.daysBeforeRenewal ? { daysBeforeRenewal: dto.daysBeforeRenewal } : {}),
        ...(dto.zombieAlertsEnabled !== undefined
          ? { zombieAlertsEnabled: dto.zombieAlertsEnabled }
          : {}),
      },
    });
  }

  /**
   * Hesabı KVKK (Unutulma Hakkı / Data Minimization) prensiplerine uygun olarak siler:
   * 1. Kişisel tanımlanabilir verileri (PII: e-posta, ad soyad, avatar, pushToken, OAuth) anonimleştirir.
   * 2. Parola ve hassas refresh token oturumlarını tamamen temizler.
   * 3. Kişisel aktif abonelikleri iptal edip soft-delete yapar.
   * 4. Ortak hesap üyeliklerinden (hesap sahibi hariç) çıkarır.
   */
  async deactivateAccount(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');

    return this.prisma.$transaction(async (tx) => {
      // 1. Refresh token'ları sil (oturumları kapat)
      await tx.refreshToken.deleteMany({ where: { userId } });

      // 2. Kişisel abonelikleri iptal et
      await tx.subscription.updateMany({
        where: { userId, sharedAccountId: null },
        data: { status: 'cancelled', deletedAt: new Date() },
      });

      // 3. Ortak hesap üyeliklerini temizle (sahibi olmadığı gruplar)
      await tx.sharedAccountMember.deleteMany({
        where: { userId, role: { not: 'owner' } },
      });

      // 4. KVKK Anonimleştirme: PII verileri temizle
      const anonymizedEmail = `deleted_user_${userId.slice(0, 8)}@deleted.subwallet.app`;
      return tx.user.update({
        where: { id: userId },
        data: {
          fullName: 'Silinmiş Kullanıcı (KVKK)',
          email: anonymizedEmail,
          passwordHash: null,
          avatarUrl: null,
          pushToken: null,
          oauthProvider: null,
          oauthProviderId: null,
          isActive: false,
          deletedAt: new Date(),
        },
      });
    });
  }
}
