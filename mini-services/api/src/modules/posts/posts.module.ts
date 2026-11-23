import { Controller, Get, Module } from '@nestjs/common';

@Controller('posts')
export class PostsController {
  @Get()
  placeholder() {
    return { status: 'NOT_IMPLEMENTED', module: 'posts' };
  }
}

@Module({ controllers: [PostsController] })
export class PostsModule {}
