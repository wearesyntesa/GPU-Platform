import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { env } from '@/core/config/env';
import type { EnvironmentImage } from './environments.repository';

const execFileAsync = promisify(execFile);

export function packageLines(manifest: string): string[] {
  return manifest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

export function derivedEnvironmentImageRef(runtime: EnvironmentImage): string {
  const name =
    runtime.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'environment';
  return `rpl-gpu-env-${name}-${runtime.id.slice(0, 8)}:current`;
}

export function environmentDockerfile(baseImageRef: string): string {
  return [
    `FROM ${baseImageRef}`,
    'USER root',
    'COPY requirements.txt /tmp/rpl-requirements.txt',
    'RUN python3 -m pip install --no-cache-dir -r /tmp/rpl-requirements.txt && rm /tmp/rpl-requirements.txt',
    'USER 1000',
    '',
  ].join('\n');
}

@Injectable()
export class EnvironmentImageBuilderService {
  private readonly logger = new Logger(EnvironmentImageBuilderService.name);

  async ensureImage(runtime: EnvironmentImage): Promise<string> {
    if (packageLines(runtime.packageManifest).length === 0) return runtime.imageRef;

    const imageRef = derivedEnvironmentImageRef(runtime);
    const previousImageId = await this.imageId(imageRef);

    const contextDir = await mkdtemp(join(tmpdir(), 'rpl-env-image-'));
    try {
      await writeFile(join(contextDir, 'Dockerfile'), environmentDockerfile(runtime.imageRef));
      await writeFile(
        join(contextDir, 'requirements.txt'),
        `${packageLines(runtime.packageManifest).join('\n')}\n`,
      );
      this.logger.log(`Building environment image ${imageRef} from ${runtime.imageRef}`);
      await this.runDocker(['build', '-t', imageRef, contextDir], 20 * 60 * 1000);
      const currentImageId = await this.imageId(imageRef);
      await this.removeReplacedImage(previousImageId, currentImageId, imageRef);
      return imageRef;
    } finally {
      await rm(contextDir, { recursive: true, force: true });
    }
  }

  private async imageId(imageRef: string): Promise<string | null> {
    try {
      const { stdout } = await this.runDocker(
        ['image', 'inspect', imageRef, '--format', '{{.Id}}'],
        30_000,
      );
      return stdout.trim() || null;
    } catch (error) {
      if (this.isImageMissingError(error)) return null;
      throw error;
    }
  }

  private async removeReplacedImage(
    previousImageId: string | null,
    currentImageId: string | null,
    imageRef: string,
  ): Promise<void> {
    if (!previousImageId || previousImageId === currentImageId) return;
    try {
      await this.runDocker(['image', 'rm', previousImageId], 60_000);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not remove previous environment image for ${imageRef}: ${message}`);
    }
  }

  private async runDocker(args: string[], timeout: number): Promise<{ stdout: string }> {
    const dockerHost = env.dockerHost.startsWith('unix://') ? env.dockerHost : undefined;
    const { stdout } = await execFileAsync('docker', args, {
      timeout,
      env: { ...process.env, ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}) },
      maxBuffer: 1024 * 1024 * 8,
    });
    return { stdout };
  }

  private isImageMissingError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    const details = [
      error.message,
      this.errorText(error, 'stderr'),
      this.errorText(error, 'stdout'),
    ].join('\n');
    return /No such image|No such object|not found/i.test(details);
  }

  private errorText(error: Error, key: 'stderr' | 'stdout'): string {
    const value = (error as unknown as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : '';
  }
}
