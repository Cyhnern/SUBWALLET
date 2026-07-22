import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Passport 'jwt' stratejisini kullanan standart guard.
// Strateji tanımı: modules/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
