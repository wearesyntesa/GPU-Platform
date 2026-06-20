import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGrantDto {
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
  purpose?: string;
}
