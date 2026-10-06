import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sistem varsayılan kategorileri (user_id NULL) + kullanıcının kendi özel kategorileri. */
  async findAllForUser(userId: string) {
    return this.prisma.category.findMany({
      where: { OR: [{ isSystem: true }, { userId }] },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(userId: string, dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { userId_name: { userId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Bu isimde bir kategoriniz zaten var');

    return this.prisma.category.create({
      data: { ...dto, userId, isSystem: false },
    });
  }

  private async findOwnedOrFail(userId: string, id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Kategori bulunamadı');
    if (category.isSystem) {
      throw new ForbiddenException('Sistem kategorileri düzenlenemez veya silinemez');
    }
    if (category.userId !== userId) {
      throw new ForbiddenException('Bu kategori size ait değil');
    }
    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOwnedOrFail(userId, id);
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(userId: string, id: string) {
    await this.findOwnedOrFail(userId, id);
    // Bu kategoriyi kullanan abonelikler otomatik olarak kategorisiz kalır (categoryId nullable FK).
    await this.prisma.category.delete({ where: { id } });
  }
}
