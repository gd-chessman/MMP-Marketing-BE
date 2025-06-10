import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Wallet } from '../wallets/wallet.entity';
import { Role } from '../users/user.entity';

@Injectable()
export class JwtGuestStrategy extends PassportStrategy(Strategy, 'jwt-guest') {
    constructor(
        private configService: ConfigService,
        @InjectRepository(User)
        private userRepository: Repository<User>,
        @InjectRepository(Wallet)
        private walletRepository: Repository<Wallet>,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromExtractors([
                (request) => {
                    return request?.cookies?.access_token;
                },
            ]),
            ignoreExpiration: false,
            secretOrKey: configService.get('JWT_SECRET'),
        });
    }

    async validate(payload: any) {
        const user = await this.userRepository.findOne({ where: { id: payload.user_id } });
        const wallet = await this.walletRepository.findOne({ where: { id: payload.wallet_id } });
        
        if (!user || !wallet) {
            return null;
        }

        // Allow both GUEST and ADMIN roles
        if (user.role !== Role.GUEST && user.role !== Role.ADMIN) {
            return null;
        }

        return {
            user,
            wallet,
            role: user.role
        };
    }
} 