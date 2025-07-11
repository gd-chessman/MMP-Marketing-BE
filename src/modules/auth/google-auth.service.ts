import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface GoogleTokenResponse {
    access_token: string;
    id_token: string;
    expires_in: number;
    refresh_token?: string;
    scope: string;
    token_type: string;
}

interface GoogleUserInfo {
    email: string;
    email_verified: boolean;
    name: string;
    picture: string;
    sub: string; // Google ID
}

interface GoogleTokenInfo extends GoogleUserInfo {
    iss: string;
    aud: string;
}

@Injectable()
export class GoogleAuthService {
    private readonly logger = new Logger(GoogleAuthService.name);
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly redirectUri: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {
        const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
        const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
        const redirectUri = this.configService.get<string>('FRONTEND_URL_REDIRECT');

        if (!clientId || !clientSecret || !redirectUri) {
            throw new Error('Google OAuth configuration is missing');
        }

        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    async exchangeCodeForToken(code: string, path: string = 'security'): Promise<GoogleTokenResponse> {
        try {
            // Decode URL encoded code
            const decodedCode = decodeURIComponent(code);
            const redirectUri = this.configService.get<string>('FRONTEND_URL_REDIRECT') + '/' + path;
            
            const response = await firstValueFrom(
                this.httpService.post<GoogleTokenResponse>(
                    'https://oauth2.googleapis.com/token',
                    {
                        code: decodedCode,
                        client_id: this.clientId,
                        client_secret: this.clientSecret,
                        redirect_uri: redirectUri,
                        grant_type: 'authorization_code',
                    }
                )
            );
            return response.data;
        } catch (error) {
            throw new BadRequestException('Failed to exchange code for token');
        }
    }

    async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<GoogleTokenInfo>(
                    `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
                )
            );

            const payload = response.data;
            // Verify token
            if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
                throw new BadRequestException('Invalid token issuer');
            }

            if (payload.aud !== this.clientId) {
                throw new BadRequestException('Invalid token audience');
            }

            // Verify email
            if (!payload.email_verified) {
                this.logger.error('Email not verified:', {
                    email: payload.email
                });
                throw new BadRequestException('Email not verified');
            }

            return payload;
        } catch (error) {
            throw new BadRequestException('Invalid Google token');
        }
    }

    async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
        try {
            const response = await firstValueFrom(
                this.httpService.get<GoogleUserInfo>(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    {
                        headers: { Authorization: `Bearer ${accessToken}` }
                    }
                )
            );

            return response.data;
        } catch (error) {
            throw new BadRequestException('Failed to get user info');
        }
    }

    getAuthUrl(path: string): string {
        const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
        if (!clientId) {
            throw new Error('GOOGLE_CLIENT_ID is not configured');
        }

        const redirectUri = this.configService.get<string>('FRONTEND_URL_REDIRECT') + '/' + path;
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('redirect_uri', redirectUri);
        params.append('scope', 'email profile');
        params.append('response_type', 'code');
        params.append('access_type', 'offline');
        params.append('prompt', 'consent');

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
} 