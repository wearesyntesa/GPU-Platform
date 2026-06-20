import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreateEnvironmentDto, UpdateEnvironmentDto } from '@/web/admin/dto';

const validCreate = {
  name: 'PyTorch 2.4',
  imageRef: 'registry.example.com/pytorch:2.4',
  pythonVersion: '3.12',
  packageManifest: 'jupyterlab\ntorch',
};

describe('CreateEnvironmentDto', () => {
  it('accepts valid input', async () => {
    const dto = plainToInstance(CreateEnvironmentDto, validCreate);
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects empty name', async () => {
    const dto = plainToInstance(CreateEnvironmentDto, { ...validCreate, name: '' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects missing imageRef', async () => {
    const { imageRef: _, ...noImage } = validCreate;
    const dto = plainToInstance(CreateEnvironmentDto, noImage);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('transforms checkbox "on" to boolean for enabled', async () => {
    const dto = plainToInstance(CreateEnvironmentDto, { ...validCreate, enabled: 'on' });
    expect(dto.enabled).toBe(true);
  });
});

describe('UpdateEnvironmentDto', () => {
  it('accepts empty object (all optional)', async () => {
    const dto = plainToInstance(UpdateEnvironmentDto, {});
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('accepts partial update', async () => {
    const dto = plainToInstance(UpdateEnvironmentDto, { name: 'New Name' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
