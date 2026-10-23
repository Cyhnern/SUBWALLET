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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(input: SendNotificationInput) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) return;

    for (const channel of input.channels) {
      let status: 'sent' | 'failed' | 'delivered' = 'sent';

      try {
        if (channel === 'push' && user.pushToken) {
          status = await this.sendExpoPushNotification(user.pushToken, input);
        } else {
          this.logger.log(`[${channel}] -> kullanıcı=${input.userId} tip=${input.type}`);
        }

        await this.prisma.notificationLog.create({
          data: {
            userId: input.userId,
            subscriptionId: input.subscriptionId,
            channel,
            type: input.type,
            status,
          },
        });
      } catch (err) {
        this.logger.error(`Bildirim gönderilemedi (${channel}): ${err}`);
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
  }

  private async sendExpoPushNotification(
    pushToken: string,
    input: SendNotificationInput,
  ): Promise<'delivered' | 'failed'> {
    if (!pushToken.startsWith('ExponentPushToken[') && !pushToken.startsWith('ExpoPushToken[')) {
      this.logger.warn(`Geçersiz Expo Push Token: ${pushToken}`);
      return 'failed';
    }

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title: 'SubWallet Bildirimi',
          body: String(input.payload.message ?? input.type),
          data: input.payload,
        }),
      });

      const resData = await response.json();
      if (response.ok && resData?.data?.[0]?.status === 'ok') {
        this.logger.log(`Expo Push başarıyla iletildi: ${pushToken}`);
        return 'delivered';
      } else {
        this.logger.error(`Expo Push teslim hatası: ${JSON.stringify(resData)}`);
        return 'failed';
      }
    } catch (e) {
      this.logger.error(`Expo Push ağ hatası: ${e}`);
      return 'failed';
    }
  }
}
