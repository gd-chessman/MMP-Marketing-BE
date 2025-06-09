// src/modules/user/user.controller.ts
import { Controller, Get, Post, Body, UseGuards, Request, Put, UseInterceptors, UploadedFiles, Res } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';

@Controller('api/users')
export class UserController {
  constructor(
    private readonly userService: UserService,
  ) {}

  @Post()
  create(@Body() user: User): Promise<User> {
    return this.userService.create(user);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@Request() req) {
    return req.user;
  }

  @Get('avatar/:id')
  async getAvatar(@Request() req, @Res() res: Response) {
    const user = await this.userService.findById(req.params.id);
    if (user && user.avatar) {
      res.setHeader('Content-Type', user.avatarMimeType);
      res.send(user.avatar);
    } else {
      res.status(404).send('Avatar not found');
    }
  }

  @Get('background/:id')
  async getBackground(@Request() req, @Res() res: Response) {
    const user = await this.userService.findById(req.params.id);
    if (user && user.background) {
      res.setHeader('Content-Type', user.backgroundMimeType);
      res.send(user.background);
    } else {
      res.status(404).send('Background not found');
    }
  }

  @Put('me')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'background', maxCount: 1 }
    ])
  )
  async update(
    @Request() req, 
    @Body() user: User, 
    @UploadedFiles() files: { avatar?: Express.Multer.File[], background?: Express.Multer.File[] }
  ): Promise<User> {
    const userId = req.user.id;
  
    if (files.avatar?.length > 0) {
      user.avatar = files.avatar[0].buffer;
      user.avatarMimeType = files.avatar[0].mimetype;
    }
  
    if (files.background?.length > 0) {
      user.background = files.background[0].buffer;
      user.backgroundMimeType = files.background[0].mimetype;
    }
  
    return this.userService.update(userId, user);
  }
}
