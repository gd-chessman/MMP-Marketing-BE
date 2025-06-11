export interface GoogleLoginDto {
    code: string;  // Authorization code from Google
}

export interface LoginResponse {
    status: number;
    message: string;
}
