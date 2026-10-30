import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { subDays } from 'date-fns';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

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
        deviceTokens: true,
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

  async registerDevice(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: {
        userId,
        token: dto.token,
        platform: dto.platform,
        lastSeenAt: new Date(),
      },
      update: {
        userId,
        platform: dto.platform ?? undefined,
        lastSeenAt: new Date(),
      },
    });
  }

  async unregisterDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, token },
    });
    return { message: 'Cihaz kaydı silindi' };
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
   * 1. Parolalı kullanıcılarda parola doğrulaması yapar.
   * 2. Sahib olduğu ortak hesaplarda sahipliği en kıdemli üyeye devreder veya hesabı siler.
   * 3. Kişisel aboneliklerde notes, invoiceUrl ve customName alanlarını null yapar (soft-delete).
   * 4. PII verileri anonimleştirir (tam userId ile e-posta).
   */
  async deactivateAccount(userId: string, dto: DeactivateAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı');

    if (user.passwordHash) {
      if (!dto.password) {
        throw new BadRequestException('Hesabı silmek için parolanızı girmeniz gereklidir');
      }
      const isValid = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
      if (!isValid) {
        throw new UnauthorizedException('Parola hatalı');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Refresh token'ları ve cihaz token'larını sil
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.deviceToken.deleteMany({ where: { userId } });

      // 2. Kullanıcının sahibi olduğu ortak hesapları yönet (en kıdemliye devret veya sil)
      const ownedAccounts = await tx.sharedAccount.findMany({
        where: { ownerId: userId },
        include: {
          members: {
            where: { userId: { not: userId } },
            orderBy: { joinedAt: 'asc' },
          },
        },
      });

      for (const acc of ownedAccounts) {
        if (acc.members.length > 0) {
          const newOwner = acc.members[0];
          await tx.sharedAccount.update({
            where: { id: acc.id },
            data: { ownerId: newOwner.userId },
          });
          await tx.sharedAccountMember.update({
            where: { sharedAccountId_userId: { sharedAccountId: acc.id, userId: newOwner.userId } },
            data: { role: 'owner' },
          });
          // Paylaşılan abonelikleri yeni sahibe taşı: kullanıcı purge edilince cascade ile kaybolmasın
          await tx.subscription.updateMany({
            where: { sharedAccountId: acc.id, userId },
            data: { userId: newOwner.userId },
          });
        } else {
          await tx.sharedAccount.delete({ where: { id: acc.id } });
        }
      }

      // 3. Kişisel aktif abonelikleri iptal et ve KVKK gereği hassas alanları null yap
      await tx.subscription.updateMany({
        where: { userId, sharedAccountId: null },
        data: {
          status: 'cancelled',
          deletedAt: new Date(),
          notes: null,
          invoiceUrl: null,
          customName: null,
        },
      });

      // 4. Ortak hesap üyeliklerinden çıkar
      // (sahiplik devrinden sonra olduğu için owner rolündeki eski satır da silinir: hayalet üye kalmaz)
      await tx.sharedAccountMember.deleteMany({ where: { userId } });

      // 5. KVKK Anonimleştirme: Tam userId ile benzersiz e-posta
      const anonymizedEmail = `deleted_${userId}@deleted.subwallet.app`;
      return tx.user.update({
        where: { id: userId },
        data: {
          fullName: 'Silinmiş Kullanıcı (KVKK)',
          email: anonymizedEmail,
          passwordHash: null,
          avatarUrl: null,
          oauthProvider: null,
          oauthProviderId: null,
          isActive: false,
          deletedAt: new Date(),
        },
      });
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'UTC' })
  async purgeSoftDeletedAccounts() {
    const thirtyDaysAgo = subDays(new Date(), 30);
    const softDeletedUsers = await this.prisma.user.findMany({
      where: {
        deletedAt: { lt: thirtyDaysAgo },
        isActive: false,
      },
      select: { id: true },
    });

    for (const u of softDeletedUsers) {
      try {
        await this.prisma.user.delete({ where: { id: u.id } });
        this.logger.log(`KVKK süresi dolan kullanıcı kalıcı olarak silindi: ${u.id}`);
      } catch (err) {
        this.logger.error(`Kullanıcı kalıcı silme hatası (userId=${u.id}): ${err}`);
      }
    }
  }
}
