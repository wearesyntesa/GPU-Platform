import { Injectable } from '@nestjs/common';
import { EnvironmentsRepository, type EnvironmentImage } from './environments.repository';
import { EnvironmentImageReadinessService } from './environment-image-readiness.service';

export type { EnvironmentImage } from './environments.repository';

@Injectable()
export class EnvironmentsService {
  constructor(
    private readonly environmentsRepository: EnvironmentsRepository,
    private readonly readiness: EnvironmentImageReadinessService,
  ) {}

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

  findById(id: string): Promise<EnvironmentImage | null> {
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
    const id = await this.environmentsRepository.create(data);
    void this.readiness.scheduleRuntime(id);
    return id;
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
    if (data.imageRef !== undefined || data.packageManifest !== undefined) {
      void this.readiness.scheduleRuntime(id);
    }
  }

  async toggleEnabled(id: string): Promise<void> {
    await this.environmentsRepository.toggleEnabled(id);
  }
}
