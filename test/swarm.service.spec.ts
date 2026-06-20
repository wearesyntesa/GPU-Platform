import { describe, expect, it, vi } from 'vitest';
import { SwarmService } from '@/infrastructure/swarm/swarm.service';

function serviceWithRemove(remove: ReturnType<typeof vi.fn>): SwarmService {
  const service = new SwarmService();
  (service as unknown as { docker: { getService: () => { remove: typeof remove } } }).docker = {
    getService: () => ({ remove }),
  };
  return service;
}

function serviceWithVolumeRemove(remove: ReturnType<typeof vi.fn>): SwarmService {
  const service = new SwarmService();
  (service as unknown as { docker: { getVolume: () => { remove: typeof remove } } }).docker = {
    getVolume: () => ({ remove }),
  };
  return service;
}

function serviceWithNodes(nodes: unknown[]): SwarmService {
  const service = new SwarmService();
  (service as unknown as { docker: { listNodes: () => Promise<unknown[]> } }).docker = {
    listNodes: async () => nodes,
  };
  return service;
}

function serviceWithVolumes(labeledVolumes: unknown[], allVolumes: unknown[]): SwarmService {
  const service = new SwarmService();
  const listVolumes = vi.fn((opts?: unknown) =>
    Promise.resolve({ Volumes: opts ? labeledVolumes : allVolumes }),
  );
  (service as unknown as { docker: { listVolumes: typeof listVolumes } }).docker = { listVolumes };
  return service;
}

function serviceWithCreate(createService: ReturnType<typeof vi.fn>): SwarmService {
  const service = new SwarmService();
  (service as unknown as {
    docker: { createVolume: ReturnType<typeof vi.fn>; createService: typeof createService };
  }).docker = {
    createVolume: vi.fn().mockResolvedValue({}),
    createService,
  };
  return service;
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
