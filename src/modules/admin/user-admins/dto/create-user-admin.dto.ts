import { IsString, IsEmail, IsNotEmpty, IsEnum, IsOptional, MinLength } from 'class-validator';
import { UserAdminRole } from '../user-admin.entity';

export class CreateUserAdminDto {
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsEnum(UserAdminRole)
  @IsOptional()
  role?: UserAdminRole = UserAdminRole.MEMBER;
} 