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
import { AuthGuard } from '@/core/guards/auth.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import { EnvironmentsService } from '@/domain/environments/environments.service';
import { NodesService } from '@/domain/nodes/nodes.service';
import { GrantsService } from '@/domain/grants/grants.service';
import { PlatformSettingsService } from '@/domain/platform-settings/platform-settings.service';
import { GrantsIndexPage } from '@/views/grants/GrantsIndexPage';
import { NewGrantPage } from '@/views/grants/NewGrantPage';
import { CreateGrantDto } from './dto';

@Controller('/grants')
export class GrantsController {
  constructor(
    private readonly grantsService: GrantsService,
    private readonly environmentsService: EnvironmentsService,
    private readonly nodesService: NodesService,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  async index(
    @Res() res: Response,
    @Session() session: AppSession,
    @Query('page') page = '1',
    @Query('message') message?: string,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AuthGuard allowed request without session user');
    const parsedPage = Number.parseInt(page, 10);
    const [grants, liveAccess] = await Promise.all([
      this.grantsService.listForUserPage(user.id, Number.isNaN(parsedPage) ? 1 : parsedPage, 10),
      this.grantsService.findLiveAccessForUser(user.id),
    ]);
    const hasLiveWorkspace =
      liveAccess?.status === 'approved'
        ? await this.grantsService.hasLiveWorkspaceForGrant(liveAccess.id)
        : false;
    renderJsx(res, GrantsIndexPage, {
      fullName: user.fullName,
      isAdmin: user.role === 'admin',
      grants,
      liveAccess,
      hasLiveWorkspace,
      message: this.accessMessage(message),
    });
  }

  private accessMessage(message?: string): string | null {
    if (message === 'grant-not-found')
      return 'Access grant was not found or is no longer available.';
    return null;
  }

  @Get('/new')
  @UseGuards(AuthGuard)
  async newRequest(@Res() res: Response, @Session() session: AppSession): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AuthGuard allowed request without session user');
    const liveAccess = await this.grantsService.findLiveAccessForUser(user.id);
    const hasLiveWorkspace =
      liveAccess?.status === 'approved'
        ? await this.grantsService.hasLiveWorkspaceForGrant(liveAccess.id)
        : false;

    if (liveAccess?.status === 'pending' || hasLiveWorkspace) {
      renderJsx(res, NewGrantPage, {
        fullName: user.fullName,
        isAdmin: user.role === 'admin',
        environments: [],
        gpuTargets: [],
        settings: { maxRequestCpu: 0, maxRequestMemoryGb: 0 },
        isChangeRequest: liveAccess?.status === 'approved',
        hasLiveWorkspace,
        hasPendingRequest: liveAccess?.status === 'pending',
      });
      return;
    }

    const [environments, gpuTargets, settings] = await Promise.all([
      this.environmentsService.listEnabled(),
      this.nodesService.listAvailableGpuTargets(),
      this.platformSettings.getSettings(),
    ]);
    renderJsx(res, NewGrantPage, {
      fullName: user.fullName,
      isAdmin: user.role === 'admin',
      environments,
      gpuTargets,
      settings,
      isChangeRequest: liveAccess?.status === 'approved',
      hasLiveWorkspace,
      hasPendingRequest: false,
    });
  }

  @Post()
  @UseGuards(AuthGuard)
  @Redirect('/grants')
  async create(@Session() session: AppSession, @Body() dto: CreateGrantDto): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AuthGuard allowed request without session user');
    await this.grantsService.createForUser(user.id, dto);
  }

  @Post('/:id/cancel')
  @UseGuards(AuthGuard)
  @Redirect('/grants')
  async cancel(@Session() session: AppSession, @Param('id') id: string): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AuthGuard allowed request without session user');
    await this.grantsService.cancelByUser(id, user.id);
  }
}
