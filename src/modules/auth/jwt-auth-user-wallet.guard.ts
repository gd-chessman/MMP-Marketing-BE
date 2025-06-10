import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthUserWalletGuard extends AuthGuard('jwt-user-wallets') {}