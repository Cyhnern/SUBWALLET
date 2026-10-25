import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

interface SendNotificationInput {
  userId: string;
  channels: NotificationChannel[];
  type: string;
  subscriptionId?: string;
  payload: Record<string, unknown>;
}

export interface NotificationResult {
  channel: NotificationChannel;
  status: 'sent' | 'failed' | 'delivered' | 'skipped';
  token?: string;
}

function formatNotificationContent(type: string, payload: Record<string, unknown>) {
  const serviceName = String(payload.serviceName ?? 'Aboneliğiniz');
  if (type === 'renewal_reminder') {
    const daysUntil = payload.daysUntil ?? 1;
    const price = payload.price ?? '';
    const currency = payload.currency ?? '';
    return {
      title: 'Yenileme Hatırlatması',
      body: `${serviceName} aboneliğinizin yenilenmesine ${daysUntil} gün kaldı (${price} ${currency}).`,
    };
  }
  if (type === 'zombie_detected') {
    return {
      title: 'Zombi Abonelik Uyarısı',
      body: `Kullanmadığınız veya maliyeti artan ${serviceName} aboneliğinizi gözden geçirmek ister misiniz?`,
    };
  }
  return {
    title: 'SubWallet Bildirimi',
    body: String(payload.message ?? type),
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(input: SendNotificationInput): Promise<NotificationResult[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      include: { deviceTokens: true },
    });
    if (!user) return [];

    const results: NotificationResult[] = [];

    for (const channel of input.channels) {
      try {
        if (channel === 'push' && user.deviceTokens && user.deviceTokens.length > 0) {
          for (const device of user.deviceTokens) {
            const pushStatus = await this.sendExpoPushNotification(device.token, input);
            results.push({ channel, status: pushStatus, token: device.token });

            await this.prisma.notificationLog.create({
              data: {
                userId: input.userId,
                subscriptionId: input.subscriptionId,
                channel,
                type: input.type,
                status: pushStatus,
              },
            });
          }
        } else {
          // Token yoksa veya push dışı bir kanal ise (email/sms) durum 'skipped' olur
          this.logger.log(`[${channel} - Atlandı/Skipped] -> kullanıcı=${input.userId} tip=${input.type}`);
          results.push({ channel, status: 'skipped' });

          await this.prisma.notificationLog.create({
            data: {
              userId: input.userId,
              subscriptionId: input.subscriptionId,
              channel,
              type: input.type,
              status: 'skipped',
            },
          });
        }
      } catch (err) {
        this.logger.error(`Bildirim gönderilemedi (${channel}): ${err}`);
        results.push({ channel, status: 'failed' });

        await this.prisma.notificationLog.create({
          data: {
            userId: input.userId,
            subscriptionId: input.subscriptionId,
            channel,
            type: input.type,
            status: 'failed',
          },
        });
      }
    }

    return results;
  }

  private async sendExpoPushNotification(
    pushToken: string,
    input: SendNotificationInput,
  ): Promise<'delivered' | 'failed'> {
    if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
      this.logger.warn(`Geçersiz Expo Push Token: ${pushToken}`);
      return 'failed';
    }

    const { title, body } = formatNotificationContent(input.type, input.payload);

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        signal: AbortSignal.timeout(10000), // 10 saniye timeout
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title,
          body,
          data: {
            type: input.type,
            subscriptionId: input.subscriptionId ?? null,
          },
        }),
      });

      const resData = await response.json();
      const ticket = resData?.data?.[0];

      if (response.ok && ticket?.status === 'ok') {
        this.logger.log(`Expo Push başarıyla iletildi: ${pushToken}`);
        return 'delivered';
      } else {
        this.logger.error(`Expo Push teslim hatası: ${JSON.stringify(resData)}`);

        // DeviceNotRegistered hatası durumunda token'ı sil
        if (ticket?.details?.error === 'DeviceNotRegistered') {
          this.logger.warn(`Geçersiz veya kaydı silinmiş token veritabanından kaldırılıyor: ${pushToken}`);
          await this.prisma.deviceToken.deleteMany({ where: { token: pushToken } }).catch(() => {});
        }

        return 'failed';
      }
    } catch (e) {
      this.logger.error(`Expo Push ağ hatası: ${e}`);
      return 'failed';
    }
  }
}
