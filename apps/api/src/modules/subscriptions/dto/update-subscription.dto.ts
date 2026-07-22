import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateSubscriptionDto } from './create-subscription.dto';

// Oluşturmada zorunlu olan her şey güncellemede opsiyoneldir.
// sharedAccountId taşınması ayrı, açık bir uç noktadan yönetilir (yanlışlıkla hesap değişimini önlemek için).
export class UpdateSubscriptionDto extends PartialType(
  OmitType(CreateSubscriptionDto, ['sharedAccountId'] as const),
) {}
