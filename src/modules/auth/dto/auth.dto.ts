import { IsArray, IsNumber, IsString } from 'class-validator';

export interface GoogleLoginDto {
    code: string;  // Authorization code from Google
    ref_code?: string;
}

export interface LoginResponse {
    status: boolean;
    message: string;
}

export interface AddGoogleAuthResponseDto {
    status: boolean;
    message: string;
    qr_code_url?: string;
    secret_key?: string;
}

export interface VerifyGoogleAuthDto {
    code: string;  // 6-digit code from Google Authenticator
}

export interface AddEmailAuthDto {
    code: string;  // Authorization code from Google
}

export interface SendEmailVerificationDto {
    email: string;
}

export interface VerifyEmailCodeDto {
    code: string;
}

export class PhantomLoginDto {
    @IsArray()
    @IsNumber({}, { each: true })
    signature: number[];

    @IsString()
    public_key: string;

    @IsString()
    message: string;

    @IsString()
    ref_code?: string;
}
