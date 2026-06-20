import { Injectable } from '@nestjs/common';
import { EnvironmentsRepository, type EnvironmentImage } from './environments.repository';

export type { EnvironmentImage } from './environments.repository';

@Injectable()
export class EnvironmentsService {
  constructor(private readonly environmentsRepository: EnvironmentsRepository) {}

  listEnabled(): Promise<EnvironmentImage[]> {
    return this.environmentsRepository.listEnabled();
  }

  async findEnabledById(id: string): Promise<EnvironmentImage | null> {
    const runtime = await this.environmentsRepository.findById(id);
    if (!runtime || !runtime.enabled) return null;
    return runtime;
  }

  listAll(): Promise<EnvironmentImage[]> {
    return this.environmentsRepository.listAll();
  }

  async findById(id: string): Promise<EnvironmentImage | null> {
    return this.environmentsRepository.findById(id);
  }

  async create(data: {
    name: string;
    imageRef: string;
    description?: string | null;
    pythonVersion?: string | null;
    packageManifest?: string;
    enabled?: boolean;
  }): Promise<string> {
    return this.environmentsRepository.create(data);
  }

  async update(
    id: string,
    data: {
      name?: string;
      imageRef?: string;
      description?: string | null;
      pythonVersion?: string | null;
      packageManifest?: string;
      enabled?: boolean;
    },
  ): Promise<void> {
    await this.environmentsRepository.update(id, data);
  }

  async toggleEnabled(id: string): Promise<void> {
    await this.environmentsRepository.toggleEnabled(id);
  }
}
