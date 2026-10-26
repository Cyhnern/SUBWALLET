import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export const INITIAL_SERVICE_PROVIDERS = [
  { name: 'Netflix', logoUrl: '🎬', websiteUrl: 'https://netflix.com' },
  { name: 'Spotify', logoUrl: '🎵', websiteUrl: 'https://spotify.com' },
  { name: 'YouTube Premium', logoUrl: '📹', websiteUrl: 'https://youtube.com' },
  { name: 'Disney+', logoUrl: '🍿', websiteUrl: 'https://disneyplus.com' },
  { name: 'ChatGPT Plus', logoUrl: '🤖', websiteUrl: 'https://chatgpt.com' },
  { name: 'Amazon Prime', logoUrl: '📦', websiteUrl: 'https://amazon.com.tr' },
  { name: 'Apple One / Music', logoUrl: '🍎', websiteUrl: 'https://apple.com' },
  { name: 'iCloud+', logoUrl: '☁️', websiteUrl: 'https://icloud.com' },
  { name: 'Exxen', logoUrl: '⚽', websiteUrl: 'https://exxen.com' },
  { name: 'BluTV', logoUrl: '🍿', websiteUrl: 'https://blutv.com' },
  { name: 'Midjourney', logoUrl: '🎨', websiteUrl: 'https://midjourney.com' },
  { name: 'PlayStation Plus', logoUrl: '🎮', websiteUrl: 'https://playstation.com' },
  { name: 'Xbox Game Pass', logoUrl: '💚', websiteUrl: 'https://xbox.com' },
  { name: 'Spor / Fitness Salonu', logoUrl: '🏋️‍♂️', websiteUrl: '' },
];

@Injectable()
export class ServiceProvidersService implements OnModuleInit {
  private readonly logger = new Logger(ServiceProvidersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedInitialProviders();
  }

  private async seedInitialProviders() {
    try {
      await this.prisma.serviceProvider.createMany({
        data: INITIAL_SERVICE_PROVIDERS,
        skipDuplicates: true,
      });
      this.logger.log('Servis sağlayıcıları başarıyla tohumlandı (seeded)');
    } catch (e) {
      this.logger.error(`Servis sağlayıcıları tohumlama hatası: ${e}`);
    }
  }

  async findAll() {
    return this.prisma.serviceProvider.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
