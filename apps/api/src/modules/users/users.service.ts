import { Injectable } from '@nestjs/common';
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

  /** Tercihler ilk girişte otomatik oluşturulmaz — burada upsert ile tembel (lazy) oluşturuluyor. */
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

  /** Hesabı soft-delete yapar; ilişkili veriler kaskad değil, denetim için korunur. */
  async deactivateAccount(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false, deletedAt: new Date() },
    });
  }
}
