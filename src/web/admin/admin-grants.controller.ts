import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Res,
  Session,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '@/core/guards/admin.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { GrantsService } from '@/domain/grants/grants.service';
import { EnvironmentsService } from '@/domain/environments/environments.service';
import { NodesService } from '@/domain/nodes/nodes.service';
import { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { ApproveGrantDto, RejectGrantDto } from './dto';
import { AdminGrantsPage } from '@/views/admin/AdminGrantsPage';
import { AdminGrantDetailPage } from '@/views/admin/AdminGrantDetailPage';

@Controller('/admin/grants')
export class AdminGrantsController {
  constructor(
    private readonly grantsService: GrantsService,
    private readonly environmentsService: EnvironmentsService,
    private readonly nodesService: NodesService,
    private readonly platformSettings: PlatformSettingsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @UseGuards(AdminGuard)
  async grants(
    @Session() session: AppSession,
    @Query('page') page = '1',
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const parsedPage = Number.parseInt(page, 10);
    const grants = await this.grantsService.listApprovedPage(
      Number.isNaN(parsedPage) ? 1 : parsedPage,
      20,
    );
    renderJsx(res, AdminGrantsPage, { fullName: user.fullName, isAdmin: true, grants });
  }

  @Get('/:id')
  @UseGuards(AdminGuard)
  async detail(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const [grantDetails, environments, gpuTargets, settings, workers] = await Promise.all([
      this.grantsService.findAdminDetailsById(id),
      this.environmentsService.listEnabled(),
      this.nodesService.listAvailableGpuTargets(),
      this.platformSettings.getSettings(),
      this.nodesService.listAll(),
    ]);
    const capacityWarning = grantDetails
      ? this.capacityWarning(workers, {
          gpuTarget: grantDetails.grant.gpuTarget,
          requestedCpu: grantDetails.grant.requestedCpu,
          requestedMemoryGb: grantDetails.grant.requestedMemoryGb,
        })
      : null;
    renderJsx(res, AdminGrantDetailPage, {
      fullName: user.fullName,
      isAdmin: true,
      grantDetails,
      environments,
      gpuTargets,
      settings,
      capacityWarning,
    });
  }

  private capacityWarning(
    workers: Awaited<ReturnType<NodesService['listAll']>>,
    request: { gpuTarget: string; requestedCpu: number; requestedMemoryGb: number },
  ): string | null {
    const availableWorkers = workers.filter((worker) => worker.enabled && !worker.maintenance);
    const matchingWorkers = availableWorkers.filter(
      (worker) =>
        request.gpuTarget === 'auto' ||
        request.gpuTarget === 'any' ||
        worker.gpuType === request.gpuTarget,
    );
    const hasKnownFit = matchingWorkers.some(
      (worker) =>
        (worker.cpuTotal ?? 0) >= request.requestedCpu &&
        (worker.memoryTotalGb ?? 0) >= request.requestedMemoryGb,
    );

    if (hasKnownFit) return null;
    if (matchingWorkers.length === 0) return 'No enabled worker matches this GPU target.';
    return 'No enabled worker with known capacity can satisfy this CPU and memory request.';
  }

  @Post('/:id/approve')
  @UseGuards(AdminGuard)
  @Redirect('/admin')
  async approve(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Body() dto: ApproveGrantDto,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    await this.grantsService.approveWithAdjustments(id, user.id, {
      runtimeImageId: dto.runtimeImageId,
      gpuTarget: dto.gpuTarget,
      requestedCpu: dto.requestedCpu,
      requestedMemoryGb: dto.requestedMemoryGb,
      reason: dto.reason?.trim() || null,
    });
    await this.auditService.record({
      actorUserId: user.id,
      action: 'grant-approve',
      targetType: 'grant',
      targetId: id,
    });
  }

  @Post('/:id/reject')
  @UseGuards(AdminGuard)
  @Redirect('/admin')
  async reject(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Body() dto: RejectGrantDto,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    await this.grantsService.reject(id, user.id, dto.reason);
    await this.auditService.record({
      actorUserId: user.id,
      action: 'grant-reject',
      targetType: 'grant',
      targetId: id,
    });
  }

  @Post('/:id/revoke')
  @UseGuards(AdminGuard)
  @Redirect('/admin/grants')
  async revoke(@Session() session: AppSession, @Param('id') id: string): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    await this.grantsService.revokeApproved(id, user.id);
    await this.auditService.record({
      actorUserId: user.id,
      action: 'grant-revoke',
      targetType: 'grant',
      targetId: id,
    });
  }
}
