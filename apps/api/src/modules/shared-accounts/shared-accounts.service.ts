import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { addDays } from 'date-fns';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSharedAccountDto } from './dto/create-shared-account.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { startOfUtcDay } from '../../common/date.util';

@Injectable()
export class SharedAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(ownerId: string, dto: CreateSharedAccountDto) {
    return this.prisma.sharedAccount.create({
      data: {
        name: dto.name,
        ownerId,
        members: { create: { userId: ownerId, role: 'owner' } },
      },
      include: { members: true },
    });
  }

  async findAllForUser(userId: string) {
    return this.prisma.sharedAccount.findMany({
      where: { members: { some: { userId } } },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
        _count: { select: { subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrFail(id: string) {
    const account = await this.prisma.sharedAccount.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { id: true, fullName: true, email: true, avatarUrl: true } } } },
        subscriptions: { where: { deletedAt: null } },
      },
    });
    if (!account) throw new NotFoundException('Ortak hesap bulunamadı');
    return account;
  }

  /**
   * E-posta numaralandırma (enumeration) saldırılarını önlemek için kullanıcı
   * sistemde kayıtlı olsun olmasın aynı yanıtı ({ status: 'invited' }) döner.
   */
  async inviteMember(sharedAccountId: string, dto: InviteMemberDto) {
    const email = dto.email.trim().toLowerCase();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = addDays(new Date(), 7);

    // Upsert invite record
    await this.prisma.sharedAccountInvite.upsert({
      where: { sharedAccountId_email: { sharedAccountId, email } },
      create: {
        sharedAccountId,
        email,
        role: dto.role ?? 'member',
        tokenHash,
        expiresAt,
      },
      update: {
        role: dto.role ?? 'member',
        tokenHash,
        expiresAt,
        acceptedAt: null,
      },
    });

    // Send invitation email via Resend if RESEND_API_KEY is configured
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const inviteLink = `subwallet://invite?token=${rawToken}`;

    if (apiKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'SubWallet <noreply@subwallet.app>',
            to: [email],
            subject: 'SubWallet Ortak Hesap Daveti',
            html: `<p>Bir ortak hesaba davet edildiniz. Katılmak için bağlantıya tıklayın: <a href="${inviteLink}">Daveti Kabul Et</a></p>`,
          }),
        });
      } catch (err) {
        console.error(`Davet e-postası gönderilemedi: ${err}`);
      }
    } else {
      console.log(`[Resend Mock Email] To: ${email}, Link: ${inviteLink}`);
    }

    return { status: 'invited', message: 'Eğer bu e-posta sistemde kayıtlıysa davet gönderildi' };
  }

  async acceptInvite(token: string, userId: string, userEmail: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = await this.prisma.sharedAccountInvite.findUnique({
      where: { tokenHash },
    });

    if (!invite || invite.expiresAt < new Date() || invite.acceptedAt) {
      throw new BadRequestException('Geçersiz veya süresi dolmuş davet bağlantısı');
    }

    if (invite.email !== userEmail.trim().toLowerCase()) {
      throw new ForbiddenException('Bu davet başka bir e-posta adresine gönderilmiş');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Üyeliği ekle (zaten üyeyse atla)
      await tx.sharedAccountMember.upsert({
        where: {
          sharedAccountId_userId: {
            sharedAccountId: invite.sharedAccountId,
            userId,
          },
        },
        create: {
          sharedAccountId: invite.sharedAccountId,
          userId,
          role: invite.role,
        },
        update: {},
      });

      // 2. Daveti kabul edildi olarak işaretle
      await tx.sharedAccountInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return { message: 'Ortak hesap daveti başarıyla kabul edildi', sharedAccountId: invite.sharedAccountId };
    });
  }

  async removeMember(sharedAccountId: string, targetUserId: string, actor: { userId: string; role: string }) {
    const target = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId: targetUserId } },
    });
    if (!target) throw new NotFoundException('Üyelik bulunamadı');

    if (actor.role === 'admin') {
      if (target.role === 'owner' || target.role === 'admin') {
        throw new ForbiddenException('Admin, başka bir admini veya hesap sahibini çıkaramaz');
      }
    }

    if (target.role === 'owner') {
      throw new BadRequestException(
        'Hesap sahibi çıkarılamaz. Önce sahipliği başka bir üyeye devretmelisiniz.',
      );
    }

    await this.prisma.sharedAccountMember.delete({
      where: { sharedAccountId_userId: { sharedAccountId, userId: targetUserId } },
    });
  }

  async leaveAccount(sharedAccountId: string, userId: string) {
    const membership = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId } },
    });
    if (!membership) throw new NotFoundException('Üyelik bulunamadı');

    if (membership.role === 'owner') {
      throw new BadRequestException(
        'Hesap sahibi ayrılamaz. Önce sahipliği başka bir üyeye devretmelisiniz.',
      );
    }

    await this.prisma.sharedAccountMember.delete({
      where: { sharedAccountId_userId: { sharedAccountId, userId } },
    });
    return { message: 'Ortak hesaptan başarıyla ayrıldınız' };
  }

  async transferOwnership(sharedAccountId: string, ownerUserId: string, newOwnerId: string) {
    const account = await this.findOneOrFail(sharedAccountId);
    if (account.ownerId !== ownerUserId) {
      throw new ForbiddenException('Yalnızca hesap sahibi sahipliği devredebilir');
    }

    const newOwnerMembership = await this.prisma.sharedAccountMember.findUnique({
      where: { sharedAccountId_userId: { sharedAccountId, userId: newOwnerId } },
    });
    if (!newOwnerMembership) {
      throw new NotFoundException('Yeni sahip bu hesabın üyesi olmalı');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.sharedAccount.update({
        where: { id: sharedAccountId },
        data: { ownerId: newOwnerId },
      });
      await tx.sharedAccountMember.update({
        where: { sharedAccountId_userId: { sharedAccountId, userId: ownerUserId } },
        data: { role: 'admin' },
      });
      await tx.sharedAccountMember.update({
        where: { sharedAccountId_userId: { sharedAccountId, userId: newOwnerId } },
        data: { role: 'owner' },
      });
    });
  }

  // ============================================
  // MALİYET PAYLAŞIMI HESAPLAMA MOTORU (A-1)
  // ============================================

  async recomputeCostSplits(sharedAccountId: string, rawBillingPeriodStart: Date) {
    const billingPeriodStart = startOfUtcDay(new Date(rawBillingPeriodStart));
    const account = await this.findOneOrFail(sharedAccountId);

    const sortedMembers = [...account.members].sort(
      (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    );
    const memberIds = sortedMembers.map((m) => m.userId);
    if (memberIds.length === 0) {
      throw new BadRequestException('Hesapta üye bulunmuyor');
    }

    return this.prisma.$transaction(async (tx) => {
      const results: any[] = [];

      for (const sub of account.subscriptions) {
        if (sub.status !== 'active') continue;

        const splits = this.computeSplitsForSubscription(Number(sub.price), memberIds);

        await tx.costSplit.createMany({
          data: splits.map((s) => ({
            subscriptionId: sub.id,
            userId: s.userId,
            splitType: 'equal',
            computedAmount: new Prisma.Decimal(s.amount),
            billingPeriodStart,
          })),
          skipDuplicates: true,
        });

        for (const split of splits) {
          await tx.costSplit.updateMany({
            where: {
              subscriptionId: sub.id,
              userId: split.userId,
              billingPeriodStart,
              isSettled: false,
            },
            data: {
              computedAmount: new Prisma.Decimal(split.amount),
            },
          });
        }

        const currentSplits = await tx.costSplit.findMany({
          where: { subscriptionId: sub.id, billingPeriodStart },
        });
        results.push(...currentSplits);
      }

      return results;
    });
  }

  private computeSplitsForSubscription(
    price: number,
    memberIds: string[],
  ): { userId: string; amount: number }[] {
    const totalCents = Math.round(price * 100);
    const memberCount = memberIds.length;
    const baseShareCents = Math.floor(totalCents / memberCount);
    let remainderCents = totalCents % memberCount;

    return memberIds.map((userId) => {
      let shareCents = baseShareCents;
      if (remainderCents > 0) {
        shareCents += 1;
        remainderCents -= 1;
      }
      return {
        userId,
        amount: Math.round(shareCents) / 100,
      };
    });
  }

  async listCostSplits(sharedAccountId: string, billingPeriodStart?: Date) {
    return this.prisma.costSplit.findMany({
      where: {
        subscription: { sharedAccountId },
        ...(billingPeriodStart ? { billingPeriodStart } : {}),
      },
      include: {
        subscription: { select: { id: true, customName: true, serviceProvider: true } },
        user: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { billingPeriodStart: 'desc' },
    });
  }

  async settleCostSplit(sharedAccountId: string, splitId: string, requestingUserId: string) {
    const { count } = await this.prisma.costSplit.updateMany({
      where: {
        id: splitId,
        userId: requestingUserId,
        isSettled: false,
        subscription: { sharedAccountId },
      },
      data: { isSettled: true, settledAt: new Date() },
    });

    if (count === 0) {
      throw new NotFoundException('Maliyet payı bulunamadı veya bu işlem için yetkiniz yok');
    }

    return { message: 'Ödeme başarılı şekilde ödendi olarak işaretlendi' };
  }
}
