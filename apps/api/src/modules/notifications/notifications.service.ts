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
    for (const channel of input.channels) {
      try {
        // TODO: Faz 2'de gerçek sağlayıcı entegrasyonu:
        // - push  -> Expo Push Notifications API
        // - email -> Resend / SendGrid şablon gönderimi
        // - sms   -> Twilio (ileri faz, opsiyonel)
        this.logger.log(`[${channel}] -> kullanıcı=${input.userId} tip=${input.type}`);

        await this.prisma.notificationLog.create({
          data: {
            userId: input.userId,
            subscriptionId: input.subscriptionId,
            channel,
            type: input.type,
            status: 'sent',
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
}
