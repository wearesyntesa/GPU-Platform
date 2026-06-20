import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateGrantDto } from '@/web/grants/dto';

describe('CreateBookingDto', () => {
  it('accepts a valid access request payload', async () => {
    const dto = plainToInstance(CreateGrantDto, {
      runtimeImageId: '0f4f6f9f-0a27-4a25-9e23-67db7c1e8c52',
      gpuTarget: 'auto',
      requestedCpu: '2',
      requestedMemoryGb: '4',
      purpose: 'course lab',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.requestedCpu).toBe(2);
  });

  it('rejects missing resource request values', async () => {
    const dto = plainToInstance(CreateGrantDto, {
      runtimeImageId: '0f4f6f9f-0a27-4a25-9e23-67db7c1e8c52',
      gpuTarget: 'auto',
      purpose: 'course lab',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid resource values', async () => {
    const dto = plainToInstance(CreateGrantDto, {
      runtimeImageId: 'not-a-uuid',
      gpuTarget: 'auto',
      requestedCpu: '0',
      requestedMemoryGb: '0',
    });

    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
