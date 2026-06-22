import { describe, expect, it, vi } from 'vitest';
import {
  derivedEnvironmentImageRef,
  environmentImageIdentity,
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

const localJupyterRuntime = {
  ...runtime,
  name: 'Local Jupyter',
  imageRef: 'rpl/jupyter-local:dev',
} as typeof runtime;

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
    const dockerfile = environmentDockerfile('python:3.12-slim');

    expect(dockerfile).toContain('FROM python:3.12-slim');
    expect(dockerfile).toContain(
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

  it('creates Swarm builder payloads for immutable worker-local images', () => {
    const service = new EnvironmentImageBuilderService();
    const spec = service.buildSpec(runtime);
    const dockerfile = Buffer.from(spec.dockerfileBase64, 'base64').toString('utf8');
    const requirements = Buffer.from(spec.requirementsBase64, 'base64').toString('utf8');

    expect(spec.imageRef).toMatch(/^rpl-gpu-env-pytorch-2-4-cuda-12345678:sha-/);
    expect(dockerfile).toContain('FROM python:3.12-slim');
    expect(requirements).toBe('jupyterlab\nnumpy==2.0.0\n');
  });

  it('includes managed local Jupyter base context for worker-local builds', () => {
    const service = new EnvironmentImageBuilderService();
    const spec = service.buildSpec(localJupyterRuntime);
    const baseDockerfile = Buffer.from(spec.baseDockerfileBase64!, 'base64').toString('utf8');
    const startScript = Buffer.from(spec.baseStartScriptBase64!, 'base64').toString('utf8');
    const startHere = Buffer.from(spec.baseStartHereBase64!, 'base64').toString('utf8');

    expect(spec.baseImageRef).toBe('rpl/jupyter-local:dev');
    expect(spec.baseContextHash).toMatch(/^[0-9a-f]{64}$/);
    expect(baseDockerfile).toContain('FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04');
    expect(startScript).toContain('exec jupyter lab');
    expect(startHere).toContain('Welcome to your RPL GPU Platform session');
  });
});
