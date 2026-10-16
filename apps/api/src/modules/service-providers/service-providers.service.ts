import { Injectable, OnModuleInit } from '@nestjs/common';
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
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedInitialProviders();
  }

  private async seedInitialProviders() {
    try {
      const count = await this.prisma.serviceProvider.count();
      if (count === 0) {
        for (const provider of INITIAL_SERVICE_PROVIDERS) {
          await this.prisma.serviceProvider.create({
            data: provider,
          });
        }
      }
    } catch (e) {
      // Ignore seeding errors on init if DB not ready yet
    }
  }

  async findAll() {
    return this.prisma.serviceProvider.findMany({
      orderBy: { name: 'asc' },
    });
  }
}
