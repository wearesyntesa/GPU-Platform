import { describe, expect, it, vi } from 'vitest';
import {
  derivedEnvironmentImageRef,
  environmentDockerfile,
  EnvironmentImageBuilderService,
  packageLines,
} from '@/domain/environments/environment-image-builder.service';

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
    expect(derivedEnvironmentImageRef(runtime)).toBe(derivedEnvironmentImageRef(runtime));
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
});
