import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ApproveGrantDto {
  @IsUUID()
  runtimeImageId!: string;

  @IsString()
  gpuTarget!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(128)
  requestedCpu!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1024)
  requestedMemoryGb!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RejectGrantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class CreateEnvironmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  imageRef!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pythonVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  packageManifest?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'on' || value === true || value === 'true')
  enabled?: boolean;
}

export class UpdateEnvironmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  imageRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pythonVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  packageManifest?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'on' || value === true || value === 'true')
  enabled?: boolean;
}

export class UpdateRetentionSettingsDto {
  @IsOptional()
  @Transform(({ value }) => value === 'on' || value === true || value === 'true')
  enabled?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(3650)
  auditLogDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(3650)
  workspaceDays!: number;

  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(3650)
  accessRequestDays!: number;

  @IsOptional()
  @Transform(({ value }) => value === 'on' || value === true || value === 'true')
  idleStopEnabled?: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  idleTimeoutMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(10000)
  batchSize!: number;
}
