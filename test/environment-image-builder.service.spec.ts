import { describe, expect, it, vi } from 'vitest';
import {
  derivedEnvironmentImageRef,
  environmentImageIdentity,
  environmentDockerfile,
  EnvironmentImageBuilderService,
  packageLines,
} from '@/domain/environments/environment-image-builder.service';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '@/core/config/env';

const runtime = {
  id: '12345678-1234-1234-1234-123456789abc',
  name: 'PyTorch 2.4 / CUDA',
  imageRef: 'python:3.12-slim',
  pythonVersion: '3.12',
  packageManifest: 'jupyterlab\n# comment\nnumpy==2.0.0\n',
} as Parameters<typeof derivedEnvironmentImageRef>[0];

describe('environment image builder helpers', () => {
  it('normalizes package manifest lines', () => {
    expect(packageLines(runtime.packageManifest)).toEqual(['jupyterlab', 'numpy==2.0.0']);
  });

  it('derives a stable Docker image tag per environment', () => {
    expect(derivedEnvironmentImageRef(runtime)).toBe(
      'rpl-gpu-env-pytorch-2-4-cuda-12345678:current',
    );
  });

  it('derives immutable content-hashed image identities for worker readiness', () => {
    const first = environmentImageIdentity(runtime);
    const second = environmentImageIdentity(runtime);
    const changed = environmentImageIdentity({ ...runtime, packageManifest: 'jupyterlab\nnumpy==2.1.0' });

    expect(first).toEqual(second);
    expect(first.imageRef).toMatch(/^rpl-gpu-env-pytorch-2-4-cuda-12345678:sha-[0-9a-f]{12}$/);
    expect(changed.imageHash).not.toBe(first.imageHash);
    expect(changed.imageRef).not.toBe(first.imageRef);
  });

  it('generates a Dockerfile that installs packages into the base image', () => {
    expect(environmentDockerfile('python:3.12-slim')).toContain('FROM python:3.12-slim');
    expect(environmentDockerfile('python:3.12-slim')).toContain(
      'python3 -m pip install --no-cache-dir -r /tmp/rpl-requirements.txt',
    );
  });

  it('rebuilds the stable tag and removes the replaced image id', async () => {
    const service = new EnvironmentImageBuilderService();
    const runDocker = vi.fn(async (args: string[]) => {
      if (args[0] === 'image' && args[1] === 'inspect') {
        return {
          stdout:
            args.includes('{{.Id}}') && runDocker.mock.calls.length === 1
              ? 'sha256:old\n'
              : 'sha256:new\n',
        };
      }
      return { stdout: '' };
    });

    (service as unknown as { runDocker: typeof runDocker }).runDocker = runDocker;

    await expect(service.ensureImage(runtime)).resolves.toBe(
      'rpl-gpu-env-pytorch-2-4-cuda-12345678:current',
    );
    expect(runDocker).toHaveBeenCalledWith(
      expect.arrayContaining(['build', '-t', 'rpl-gpu-env-pytorch-2-4-cuda-12345678:current']),
      20 * 60 * 1000,
    );
    expect(runDocker).toHaveBeenCalledWith(['image', 'rm', 'sha256:old'], 60_000);
  });

  it('builds, verifies, saves, and hashes immutable image artifacts', async () => {
    const service = new EnvironmentImageBuilderService();
    const artifactDir = await mkdtemp(join(tmpdir(), 'rpl-artifacts-'));
    const runDocker = vi.fn(async (args: string[]) => {
      if (args[0] === 'image' && args[1] === 'inspect') return { stdout: 'sha256:new\n' };
      if (args[0] === 'save' && args[2]) await writeFile(args[2], 'artifact');
      return { stdout: '' };
    });
    env.workerImageArtifactDir = artifactDir;
    (service as unknown as { runDocker: typeof runDocker }).runDocker = runDocker;

    const artifact = await service.buildArtifact(runtime);

    expect(artifact.imageRef).toMatch(/^rpl-gpu-env-pytorch-2-4-cuda-12345678:sha-/);
    expect(artifact.imageId).toBe('sha256:new');
    expect(artifact.artifactSha256).toHaveLength(64);
    expect(runDocker).toHaveBeenCalledWith(
      expect.arrayContaining(['build', '--no-cache', '-t', artifact.imageRef]),
      20 * 60 * 1000,
    );
    expect(runDocker).toHaveBeenCalledWith(
      ['run', '--rm', artifact.imageRef, 'python3', '-m', 'pip', 'check'],
      5 * 60 * 1000,
    );
    expect(runDocker).toHaveBeenCalledWith(['save', '-o', artifact.artifactPath, artifact.imageRef], 10 * 60 * 1000);
  });
});
