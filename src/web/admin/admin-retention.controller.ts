import {
  Body,
  Controller,
  Get,
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
import { AuditService } from '@/infrastructure/audit/audit.service';
import {
  RetentionService,
  type RetentionDryRunResult,
  type RetentionSettingsValue,
} from '@/domain/retention/retention.service';
import { UpdateRetentionSettingsDto } from './dto';
import { AdminRetentionPage } from '@/views/admin/AdminRetentionPage';

@Controller('/admin/retention')
export class AdminRetentionController {
  constructor(
    private readonly retention: RetentionService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @UseGuards(AdminGuard)
  async index(
    @Session() session: AppSession,
    @Res() res: Response,
    @Query('message') message?: string,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    renderJsx(res, AdminRetentionPage, {
      username: user.username,
      isAdmin: true,
      settings: await this.retention.getSettings(),
      dryRun: null,
      message: message === 'saved' ? 'Retention settings saved.' : null,
    });
  }

  @Post('/save')
  @UseGuards(AdminGuard)
  @Redirect('/admin/retention?message=saved')
  async save(
    @Session() session: AppSession,
    @Body() dto: UpdateRetentionSettingsDto,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const settings = this.fromDto(dto);
    await this.retention.saveSettings(settings, user.id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'retention-settings-update',
      targetType: 'retention-settings',
      targetId: 'settings',
      metadata: {
        enabled: settings.enabled,
        auditLogDays: settings.auditLogDays,
        workspaceDays: settings.workspaceDays,
        accessRequestDays: settings.accessRequestDays,
        idleStopEnabled: settings.idleStopEnabled,
        idleTimeoutMinutes: settings.idleTimeoutMinutes,
        batchSize: settings.batchSize,
      },
    });
  }

  @Post('/dry-run')
  @UseGuards(AdminGuard)
  async dryRun(
    @Session() session: AppSession,
    @Body() dto: UpdateRetentionSettingsDto,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const settings = this.fromDto(dto);
    renderJsx(res, AdminRetentionPage, {
      username: user.username,
      isAdmin: true,
      settings,
      dryRun: await this.retention.dryRun(settings),
      message: 'Dry run only. No rows were deleted.',
    });
  }

  private fromDto(dto: UpdateRetentionSettingsDto): RetentionSettingsValue {
    return {
      enabled: dto.enabled ?? false,
      auditLogDays: dto.auditLogDays,
      workspaceDays: dto.workspaceDays,
      accessRequestDays: dto.accessRequestDays,
      idleStopEnabled: dto.idleStopEnabled ?? false,
      idleTimeoutMinutes: dto.idleTimeoutMinutes,
      batchSize: dto.batchSize,
    };
  }
}
