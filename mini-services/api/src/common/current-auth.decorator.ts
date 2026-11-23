import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthContext } from './auth.guard';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest();
    return req.auth;
  },
);
