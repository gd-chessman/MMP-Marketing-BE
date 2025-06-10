import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { TelegramCodesService } from './telegram-codes.service';

@Controller('telegram-codes')
export class TelegramCodesController {
  constructor(private readonly telegramCodesService: TelegramCodesService) {}

}