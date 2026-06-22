import { Injectable, Logger } from '@nestjs/common';
import Dockerode = require('dockerode');
import { env } from '@/core/config/env';

export interface GpuNode {
  nodeId: string;
  hostname: string;
  address: string;
  station: string;
  gpuType: string;
  gpuCount: number;
  vramGb: number | null;
  cpuTotal: number | null;
  memoryTotalGb: number | null;
  available: boolean;
}

export interface CreateServiceOpts {
  name: string;
  image: string;
  constraints: string[];
  cpus: number;
  memoryBytes: number;
  envVars: string[];
  publishedPort: number;
  volumeName: string;
}

export interface CreateEnvironmentImageBuildServiceOpts {
  name: string;
  runtimeImageId: string;
  workerId: string;
  workerSwarmNodeId: string;
  imageRef: string;
  imageHash: string;
  dockerfileBase64: string;
  requirementsBase64: string;
}

type GpuDeviceRequest = {
  Driver: 'nvidia';
  Count: number;
  Capabilities: string[][];
};

type GpuContainerSpec = Dockerode.ContainerSpec & {
  DeviceRequests: GpuDeviceRequest[];
};

export interface SwarmTaskInfo {
  taskId: string;
  state: string;
  containerId: string | null;
  error: string | null;
}

export interface CreateServiceResult {
  serviceId: string;
  serviceName: string;
}

export interface PlatformServiceInfo {
  id: string;
  name: string;
}

export interface PlatformVolumeInfo {
  name: string;
}

@Injectable()
export class SwarmService {
  private readonly logger = new Logger(SwarmService.name);
  private readonly docker = new Dockerode({ socketPath: this.parseDockerHost() });

  private parseDockerHost(): string {
    const host = env.dockerHost;
    if (host.startsWith('unix://')) return host.slice('unix://'.length);
    return host;
  }

  async ping(): Promise<void> {
    await this.docker.ping();
  }

  async listGpuNodes(): Promise<GpuNode[]> {
    const nodes = await this.docker.listNodes({
      filters: JSON.stringify({ 'node.label': ['rpl.gpu=true'] }),
    });

    return nodes
      .map((node): GpuNode | null => {
        const labels: Record<string, string> = node.Spec?.Labels ?? {};
        const station = labels['rpl.station'];
        const gpuType = labels['rpl.gpu_type'];
        if (!station || !gpuType) return null;

        const gpuCount = Number(labels['rpl.gpu_count'] ?? '1') || 1;
        const vramRaw = labels['rpl.vram_gb'];
        const vramGb = vramRaw ? Number(vramRaw) || null : null;
        const cpuTotal = this.numberLabel(labels['rpl.cpu_total']);
        const memoryTotalGb =
          this.numberLabel(labels['rpl.memory_total_gb']) ??
          this.memoryBytesToGb(node.Description?.Resources?.MemoryBytes);

        return {
          nodeId: node.ID ?? '',
          hostname: node.Description?.Hostname ?? 'unknown',
          address: node.Status?.Addr ?? '0.0.0.0',
          station,
          gpuType,
          gpuCount,
          vramGb,
          cpuTotal: cpuTotal ?? this.nanoCpusToCores(node.Description?.Resources?.NanoCPUs),
          memoryTotalGb,
          available: node.Status?.State === 'ready' && node.Spec?.Availability === 'active',
        };
      })
      .filter((n): n is GpuNode => n !== null);
  }

  async createService(opts: CreateServiceOpts): Promise<CreateServiceResult> {
    this.logger.log(
      `Creating swarm service: ${opts.name} image=${opts.image} port=${opts.publishedPort}`,
    );

    await this.docker.createVolume({
      Name: opts.volumeName,
      Labels: {
        'rpl.gpu-platform': 'true',
        'rpl.workspace-volume': 'true',
        'rpl.service': opts.name,
      },
    });

    const containerSpec: GpuContainerSpec = {
      Image: opts.image,
      Env: [
        ...opts.envVars,
        `CPU_LIMIT=${opts.cpus * 100}`,
        `MEM_LIMIT=${opts.memoryBytes}`,
        'NVIDIA_VISIBLE_DEVICES=all',
        'NVIDIA_DRIVER_CAPABILITIES=compute,utility',
      ],
      DeviceRequests: [
        {
          Driver: 'nvidia',
          Count: -1,
          Capabilities: [['gpu']],
        },
      ],
      Mounts: [
        {
          Type: 'volume',
          Source: opts.volumeName,
          Target: '/work',
        },
      ],
      Labels: {
        'rpl.gpu-platform': 'true',
        'rpl.workspace-service': 'true',
        'rpl.service': opts.name,
      },
    };

    const service = await this.docker.createService({
      Name: opts.name,
      Labels: {
        'rpl.gpu-platform': 'true',
        'rpl.workspace-service': 'true',
        'rpl.service': opts.name,
      },
      TaskTemplate: {
        ContainerSpec: containerSpec,
        Resources: {
          Limits: {
            NanoCPUs: opts.cpus * 1_000_000_000,
            MemoryBytes: opts.memoryBytes,
          },
          Reservations: {
            NanoCPUs: opts.cpus * 1_000_000_000,
            MemoryBytes: opts.memoryBytes,
          },
        },
        Placement: {
          Constraints: opts.constraints,
        },
        RestartPolicy: {
          Condition: 'none',
        },
      },
      Mode: { Replicated: { Replicas: 1 } },
      EndpointSpec: {
        Ports: [
          {
            Protocol: 'tcp',
            TargetPort: 8888,
            PublishedPort: opts.publishedPort,
            PublishMode: 'ingress',
          },
        ],
      },
    });

    const serviceId = service.id;
    this.logger.log(`Swarm service created: ${serviceId}`);
    return { serviceId, serviceName: opts.name };
  }

  async createEnvironmentImageBuildService(
    opts: CreateEnvironmentImageBuildServiceOpts,
  ): Promise<CreateServiceResult> {
    this.logger.log(`Creating image builder service: ${opts.name} image=${opts.imageRef}`);

    const service = await this.docker.createService({
      Name: opts.name,
      Labels: {
        'rpl.environment-image-builder': 'true',
        'rpl.runtime-image-id': opts.runtimeImageId,
        'rpl.worker-id': opts.workerId,
        'rpl.image-hash': opts.imageHash,
        'rpl.service': opts.name,
      },
      TaskTemplate: {
        ContainerSpec: {
          Image: env.environmentImageBuilderImage,
          Env: [
            `RPL_ENV_IMAGE_REF=${opts.imageRef}`,
            `RPL_ENV_DOCKERFILE_B64=${opts.dockerfileBase64}`,
            `RPL_ENV_REQUIREMENTS_B64=${opts.requirementsBase64}`,
          ],
          Command: ['sh', '-lc', this.environmentImageBuildCommand()],
          Mounts: [
            {
              Type: 'bind',
              Source: '/var/run/docker.sock',
              Target: '/var/run/docker.sock',
            },
          ],
          Labels: {
            'rpl.environment-image-builder': 'true',
            'rpl.service': opts.name,
          },
        },
        Placement: {
          Constraints: [`node.id == ${opts.workerSwarmNodeId}`],
        },
        RestartPolicy: {
          Condition: 'none',
        },
      },
      Mode: { Replicated: { Replicas: 1 } },
    });

    return { serviceId: service.id, serviceName: opts.name };
  }

  async inspectServiceTasks(serviceId: string): Promise<SwarmTaskInfo[]> {
    const tasks = await this.docker.listTasks({
      filters: JSON.stringify({ service: [serviceId] }),
    });

    return tasks.map(
      (task): SwarmTaskInfo => ({
        taskId: task.ID ?? '',
        state: task.Status?.State ?? 'unknown',
        containerId: task.Status?.ContainerStatus?.ContainerID ?? null,
        error: task.Status?.Err ?? null,
      }),
    );
  }

  async findServiceByName(name: string): Promise<string | null> {
    const services = await this.docker.listServices({ filters: JSON.stringify({ name: [name] }) });
    const service = services.find((item) => item.Spec?.Name === name);
    return service?.ID ?? null;
  }

  async listPlatformServices(): Promise<PlatformServiceInfo[]> {
    const services = await this.docker.listServices({
      filters: JSON.stringify({ label: ['rpl.gpu-platform=true', 'rpl.workspace-service=true'] }),
    });
    return services
      .map((service) => ({ id: service.ID ?? '', name: service.Spec?.Name ?? '' }))
      .filter((service) => service.id && service.name);
  }

  async listPlatformVolumes(): Promise<PlatformVolumeInfo[]> {
    const labeled = await this.docker.listVolumes({
      filters: JSON.stringify({ label: ['rpl.gpu-platform=true', 'rpl.workspace-volume=true'] }),
    });
    const volumes = labeled.Volumes ?? [];

    return Array.from(
      new Set(volumes.map((volume) => volume.Name).filter((name): name is string => !!name)),
    ).map((name) => ({ name }));
  }

  async listLegacyWorkspaceVolumes(): Promise<PlatformVolumeInfo[]> {
    const all = await this.docker.listVolumes();
    return Array.from(
      new Set(
        (all.Volumes ?? [])
          .map((volume) => volume.Name)
          .filter((name): name is string => this.isLegacyWorkspaceVolume(name)),
      ),
    ).map((name) => ({ name }));
  }

  async removeService(serviceId: string): Promise<void> {
    this.logger.log(`Removing swarm service: ${serviceId}`);
    const service = this.docker.getService(serviceId);
    try {
      await service.remove();
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw err;
    }
  }

  async removeVolume(volumeName: string): Promise<void> {
    this.logger.log(`Removing workspace volume: ${volumeName}`);
    const volume = this.docker.getVolume(volumeName);
    try {
      await volume.remove();
    } catch (err) {
      if (this.isNotFound(err)) return;
      throw err;
    }
  }

  private isNotFound(err: unknown): boolean {
    const error = err as { statusCode?: number; status?: number; message?: string };
    return (
      error.statusCode === 404 ||
      error.status === 404 ||
      error.message?.toLowerCase().includes('not found') === true
    );
  }

  private isLegacyWorkspaceVolume(name: string | undefined): boolean {
    return name?.startsWith('rpl-workspace-') === true && name.endsWith('-data');
  }

  private numberLabel(value: string | undefined): number | null {
    if (!value) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private nanoCpusToCores(value: number | undefined): number | null {
    return value ? Math.max(1, Math.round(value / 1_000_000_000)) : null;
  }

  private memoryBytesToGb(value: number | undefined): number | null {
    return value ? Math.max(1, Math.round(value / 1024 / 1024 / 1024)) : null;
  }

  private environmentImageBuildCommand(): string {
    return [
      'set -eu',
      'build_dir=$(mktemp -d)',
      'trap "rm -rf $build_dir" EXIT',
      'printf %s "$RPL_ENV_DOCKERFILE_B64" | base64 -d > "$build_dir/Dockerfile"',
      'printf %s "$RPL_ENV_REQUIREMENTS_B64" | base64 -d > "$build_dir/requirements.txt"',
      'docker build --no-cache -t "$RPL_ENV_IMAGE_REF" "$build_dir"',
      'docker run --rm "$RPL_ENV_IMAGE_REF" python3 -m pip check',
      'docker image inspect "$RPL_ENV_IMAGE_REF" --format "{{.Id}}"',
    ].join('; ');
  }
}
