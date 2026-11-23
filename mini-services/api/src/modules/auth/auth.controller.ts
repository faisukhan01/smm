import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { AuthGuard, SESSION_COOKIE } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { loginSchema, registerSchema, type SessionPayload } from '@smm/shared';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Post('register')
  @HttpCode(201)
  async register(@Body(new ZodValidationPipe(registerSchema)) body: { name: string; email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.register(body);
    this.setSessionCookie(res, session.user.id, session.workspace.id);
    return session;
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(loginSchema)) body: { email: string; password: string }, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.login(body);
    this.setSessionCookie(res, session.user.id, session.workspace.id);
    return session;
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    return;
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() body: { token: string }) {
    return this.auth.verifyEmail(String(body?.token ?? ''));
  }

  @Get('session')
  @UseGuards(AuthGuard)
  session(@CurrentAuth() auth: { userId: string; workspaceId: string }) {
    return this.auth.buildSession(auth.userId, auth.workspaceId);
  }

  private setSessionCookie(res: Response, userId: string, workspaceId: string) {
    const token = this.jwt.sign({ sub: userId, wsId: workspaceId }, { expiresIn: '7d' });
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
