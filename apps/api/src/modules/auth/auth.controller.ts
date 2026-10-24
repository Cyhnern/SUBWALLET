import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AppleLoginDto } from './dto/apple-login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ExchangeCodeDto } from './dto/exchange-code.dto';
import { verifyGoogleIdToken, verifyAppleIdToken } from './oauth-verify.util';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { GoogleProfile } from './strategies/google.strategy';

@ApiTags('auth')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Get('verify-email')
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout-all-devices')
  logoutAllDevices(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeAllSessions(user.id);
  }

  // --- Google OAuth2 Web Redirect (60 saniyelik tek kullanımlık kod ile exchange) ---
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('oauth/google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('oauth/google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const profile = req.user as GoogleProfile;
    const tokens = await this.authService.validateOAuthLogin({
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
    });

    const code = await this.authService.createExchangeCode(tokens);
    const redirectUrl = this.config.get<string>('MOBILE_OAUTH_REDIRECT_URL', 'subwallet://oauth');
    return res.redirect(`${redirectUrl}?code=${code}`);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('oauth/exchange')
  async exchangeOAuthCode(@Body() dto: ExchangeCodeDto) {
    return this.authService.exchangeCode(dto.code);
  }

  // --- Google Token Sign-In (Mobil/API idToken) ---
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('oauth/google')
  async googleTokenLogin(@Body() dto: GoogleLoginDto) {
    try {
      const clientId = this.config.get<string>('GOOGLE_CLIENT_ID') ?? 'default_google_client_id';
      const profile = await verifyGoogleIdToken(dto.idToken, clientId);
      return this.authService.validateOAuthLogin(profile);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Geçersiz Google kimlik doğrulaması');
    }
  }

  // --- Apple Sign-In (Mobil/API identityToken) ---
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('oauth/apple')
  async appleLogin(@Body() dto: AppleLoginDto) {
    try {
      const clientId = this.config.get<string>('APPLE_CLIENT_ID') ?? 'default_apple_client_id';
      const profile = await verifyAppleIdToken(dto.identityToken, clientId);
      return this.authService.validateOAuthLogin(profile);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Geçersiz Apple kimlik doğrulaması');
    }
  }
}
