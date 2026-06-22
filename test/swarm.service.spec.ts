import { describe, expect, it, vi } from 'vitest';
import { SwarmService } from '@/infrastructure/swarm/swarm.service';

function serviceWithDocker<TDocker extends object>(docker: TDocker): SwarmService {
  const service = new SwarmService();
  (service as unknown as { docker: TDocker }).docker = docker;
  return service;
}

function serviceWithRemove(remove: ReturnType<typeof vi.fn>): SwarmService {
  return serviceWithDocker({
    getService: () => ({ remove }),
  });
}

function serviceWithVolumeRemove(remove: ReturnType<typeof vi.fn>): SwarmService {
  return serviceWithDocker({
    getVolume: () => ({ remove }),
  });
}

function serviceWithNodes(nodes: unknown[]): SwarmService {
  return serviceWithDocker({
    listNodes: async () => nodes,
  });
}

function serviceWithVolumes(labeledVolumes: unknown[], allVolumes: unknown[]): SwarmService {
  const listVolumes = vi.fn((opts?: unknown) =>
    Promise.resolve({ Volumes: opts ? labeledVolumes : allVolumes }),
  );
  return serviceWithDocker({ listVolumes });
}

function serviceWithCreate(createService: ReturnType<typeof vi.fn>): SwarmService {
  return serviceWithDocker({
    createVolume: vi.fn().mockResolvedValue({}),
    createService,
  });
}

describe('SwarmService.removeService', () => {
  it('treats Docker 404 removal as already clean', async () => {
    const remove = vi.fn().mockRejectedValue({ statusCode: 404, message: 'service not found' });

    await expect(
      serviceWithRemove(remove).removeService('missing-service'),
    ).resolves.toBeUndefined();
  });

  it('rethrows non-404 removal errors', async () => {
    const error = new Error('docker unavailable');
    const remove = vi.fn().mockRejectedValue(error);

    await expect(serviceWithRemove(remove).removeService('service-1')).rejects.toThrow(error);
  });
});

describe('SwarmService.removeVolume', () => {
  it('treats Docker 404 volume removal as already clean', async () => {
    const remove = vi.fn().mockRejectedValue({ statusCode: 404, message: 'volume not found' });

    await expect(
      serviceWithVolumeRemove(remove).removeVolume('missing-volume'),
    ).resolves.toBeUndefined();
  });

  it('rethrows non-404 volume removal errors', async () => {
    const error = new Error('volume in use');
    const remove = vi.fn().mockRejectedValue(error);

    await expect(serviceWithVolumeRemove(remove).removeVolume('volume-1')).rejects.toThrow(error);
  });
});

describe('SwarmService.listPlatformVolumes', () => {
  it('includes labeled current volumes only', async () => {
    const volumes = await serviceWithVolumes(
      [{ Name: 'rpl-workspace-current-data' }],
      [
        { Name: 'rpl-workspace-legacy-data' },
        { Name: 'postgres-data' },
        { Name: 'rpl-workspace-not-data-cache' },
      ],
    ).listPlatformVolumes();

    expect(volumes).toEqual([{ name: 'rpl-workspace-current-data' }]);
  });
});

describe('SwarmService.listLegacyWorkspaceVolumes', () => {
  it('includes legacy prefixed workspace volumes only', async () => {
    const volumes = await serviceWithVolumes(
      [],
      [
        { Name: 'rpl-workspace-legacy-data' },
        { Name: 'postgres-data' },
        { Name: 'rpl-workspace-not-data-cache' },
      ],
    ).listLegacyWorkspaceVolumes();

    expect(volumes).toEqual([{ name: 'rpl-workspace-legacy-data' }]);
  });
});

describe('SwarmService.listGpuNodes', () => {
  it('maps CPU and memory labels from Swarm nodes', async () => {
    const [node] = await serviceWithNodes([
      {
        ID: 'node-1',
        Spec: {
          Availability: 'active',
          Labels: {
            'rpl.station': 'station03',
            'rpl.gpu_type': 'NVIDIA GeForce RTX 3050',
            'rpl.gpu_count': '1',
            'rpl.vram_gb': '8',
            'rpl.cpu_total': '12',
            'rpl.memory_total_gb': '32',
          },
        },
        Description: { Hostname: 'station03.infra.labrpl.net' },
        Status: { Addr: '192.168.10.13', State: 'ready' },
      },
    ]).listGpuNodes();

    expect(node).toMatchObject({
      cpuTotal: 12,
      memoryTotalGb: 32,
      gpuCount: 1,
      vramGb: 8,
    });
  });
});

describe('SwarmService.createService', () => {
  it('creates GPU-enabled Jupyter services mounted at /work', async () => {
    const createService = vi.fn().mockResolvedValue({ id: 'service-1' });

    await serviceWithCreate(createService).createService({
      name: 'rpl-workspace-session-1',
      image: 'rpl/jupyter-local:dev',
      envVars: ['JUPYTER_TOKEN=token'],
      publishedPort: 20000,
      cpus: 1,
      memoryBytes: 1_073_741_824,
      constraints: ['node.labels.rpl.gpu == true'],
      volumeName: 'rpl-workspace-session-1-data',
    });

    expect(createService).toHaveBeenCalledWith(
      expect.objectContaining({
        TaskTemplate: expect.objectContaining({
          ContainerSpec: expect.objectContaining({
            Env: expect.arrayContaining([
              'JUPYTER_TOKEN=token',
              'CPU_LIMIT=100',
              'MEM_LIMIT=1073741824',
              'NVIDIA_VISIBLE_DEVICES=all',
              'NVIDIA_DRIVER_CAPABILITIES=compute,utility',
            ]),
            DeviceRequests: [
              {
                Driver: 'nvidia',
                Count: -1,
                Capabilities: [['gpu']],
              },
            ],
            Mounts: expect.arrayContaining([
              expect.objectContaining({
                Type: 'volume',
                Source: 'rpl-workspace-session-1-data',
                Target: '/work',
              }),
            ]),
          }),
        }),
      }),
    );
  });
});

describe('SwarmService.createEnvironmentImageBuildService', () => {
  it('creates a worker-pinned builder service with Docker socket only', async () => {
    const createService = vi.fn().mockResolvedValue({ id: 'builder-service-1' });

    await serviceWithCreate(createService).createEnvironmentImageBuildService({
      name: 'rpl-env-builder-runtime-worker-abcdef123456',
      runtimeImageId: 'runtime-1',
      workerId: 'worker-1',
      workerSwarmNodeId: 'node-1',
      imageRef: 'rpl-gpu-env-local-jupyter-runtime1:sha-abcdef123456',
      imageHash: 'abcdef123456',
      dockerfileBase64: 'RE9DS0VSRklMRQ==',
      requirementsBase64: 'cmVxdWlyZW1lbnRz',
      baseImageRef: 'rpl/jupyter-local:dev',
      baseContextHash: 'base-hash',
      baseDockerfileBase64: 'QkFTRS1ET0NLRVJGSUxF',
      baseStartScriptBase64: 'U1RBUlQ=',
      baseStartHereBase64: 'Tk9URUJPT0s=',
    });

    expect(createService).toHaveBeenCalledWith(
      expect.objectContaining({
        Labels: expect.objectContaining({
          'rpl.environment-image-builder': 'true',
          'rpl.runtime-image-id': 'runtime-1',
          'rpl.worker-id': 'worker-1',
          'rpl.image-hash': 'abcdef123456',
        }),
        TaskTemplate: expect.objectContaining({
          Placement: { Constraints: ['node.id == node-1'] },
          RestartPolicy: { Condition: 'none' },
          ContainerSpec: expect.objectContaining({
            Env: expect.arrayContaining([
              'RPL_ENV_IMAGE_REF=rpl-gpu-env-local-jupyter-runtime1:sha-abcdef123456',
              'RPL_ENV_DOCKERFILE_B64=RE9DS0VSRklMRQ==',
              'RPL_ENV_REQUIREMENTS_B64=cmVxdWlyZW1lbnRz',
              'RPL_BASE_IMAGE_REF=rpl/jupyter-local:dev',
              'RPL_BASE_CONTEXT_HASH=base-hash',
              'RPL_BASE_DOCKERFILE_B64=QkFTRS1ET0NLRVJGSUxF',
              'RPL_BASE_START_SCRIPT_B64=U1RBUlQ=',
              'RPL_BASE_START_HERE_B64=Tk9URUJPT0s=',
            ]),
            Command: expect.arrayContaining([
              expect.stringContaining('docker build --no-cache -t "$RPL_BASE_IMAGE_REF"'),
            ]),
            Mounts: [
              {
                Type: 'bind',
                Source: '/var/run/docker.sock',
                Target: '/var/run/docker.sock',
              },
            ],
          }),
        }),
        Mode: { Replicated: { Replicas: 1 } },
      }),
    );
  });
});
