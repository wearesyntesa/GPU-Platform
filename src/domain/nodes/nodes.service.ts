import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { workers } from '@/infrastructure/db/schema';
import { SwarmService, type GpuNode } from '@/infrastructure/swarm/swarm.service';
import { NodesRepository } from './nodes.repository';

@Injectable()
export class NodesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NodesService.name);

  constructor(
    private readonly nodesRepository: NodesRepository,
    private readonly swarmService: SwarmService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.syncFromSwarm();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async syncFromSwarm(): Promise<void> {
    let gpuNodes: GpuNode[];
    try {
      gpuNodes = await this.swarmService.listGpuNodes();
    } catch (err) {
      this.logger.warn('Swarm sync failed - Docker may be unavailable', (err as Error).message);
      return;
    }

    this.logger.log(`Syncing ${gpuNodes.length} GPU node(s) from Swarm`);
    const now = new Date();
    const syncedNodeIds: string[] = [];

    for (const node of gpuNodes) {
      syncedNodeIds.push(node.nodeId);
      if (await this.isNodeUnchanged(node)) continue;
      await this.nodesRepository.upsertGpuNode(node, now);
    }

    await this.nodesRepository.disableMissingSwarmNodes(syncedNodeIds, now);
  }

  listAll(): Promise<(typeof workers.$inferSelect)[]> {
    return this.nodesRepository.listAll();
  }

  async listWithUsage(): Promise<
    (typeof workers.$inferSelect & {
      statusLabel: string;
      activeWorkspace: {
        id: string;
        status: string;
        requester: string;
        environment: string;
        startedAt: Date | null;
        expiresAt: Date | null;
      } | null;
    })[]
  > {
    const rows = await this.nodesRepository.listWithUsageRows();

    return rows.map((row) => {
      const workspace = row.workspace;
      let statusLabel = 'Free';
      if (!row.worker.enabled) statusLabel = 'Disabled';
      else if (row.worker.maintenance) statusLabel = 'Maintenance';
      else if (workspace?.id) statusLabel = 'Busy';

      return {
        ...row.worker,
        statusLabel,
        activeWorkspace: workspace?.id
          ? {
              id: workspace.id,
              status: workspace.status ?? 'unknown',
              requester: row.requester?.username ?? 'unknown',
              environment: row.environment?.name ?? 'unknown',
              startedAt: workspace.startedAt,
              expiresAt: workspace.expiresAt,
            }
          : null,
      };
    });
  }

  async listAvailableGpuTargets(): Promise<string[]> {
    return this.nodesRepository.listAvailableGpuTargets();
  }

  async toggleEnabled(id: string): Promise<void> {
    await this.nodesRepository.toggleEnabled(id);
  }

  async toggleMaintenance(id: string): Promise<void> {
    await this.nodesRepository.toggleMaintenance(id);
  }

  private async isNodeUnchanged(node: GpuNode): Promise<boolean> {
    const current = await this.nodesRepository.findBySwarmNodeId(node.nodeId);
    if (!current) return false;
    return (
      current.name === `${node.station}-${node.hostname}` &&
      current.address === node.address &&
      current.gpuType === node.gpuType &&
      current.gpuCount === node.gpuCount &&
      current.vramGb === node.vramGb &&
      current.cpuTotal === node.cpuTotal &&
      current.memoryTotalGb === node.memoryTotalGb &&
      current.enabled === node.available
    );
  }
}
