import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Redirect,
  Res,
  Session,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '@/core/guards/admin.guard';
import { sessionUser, type AppSession } from '@/core/session';
import { renderJsx } from '@/core/render-jsx';
import {
  EnvironmentsService,
  type EnvironmentImage,
} from '@/domain/environments/environments.service';
import { AuditService } from '@/infrastructure/audit/audit.service';
import { CreateEnvironmentDto, UpdateEnvironmentDto } from './dto';
import { AdminEnvironmentsPage } from '@/views/admin/AdminEnvironmentsPage';
import { AdminEnvironmentFormPage } from '@/views/admin/AdminEnvironmentFormPage';
import { packageLines } from '@/domain/environments/environment-image-builder.service';

type EnvironmentFormData = Partial<EnvironmentImage> & {
  name?: string;
  imageRef?: string;
  description?: string | null;
  pythonVersion?: string | null;
  packageManifest?: string;
  enabled?: boolean;
};

interface ValidationResult {
  ok: boolean;
  messages: string[];
}

@Controller('/admin/environments')
export class AdminEnvironmentsController {
  constructor(
    private readonly environments: EnvironmentsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @UseGuards(AdminGuard)
  async index(@Session() session: AppSession, @Res() res: Response): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const environmentList = await this.environments.listAll();
    renderJsx(res, AdminEnvironmentsPage, {
      username: user.username,
      isAdmin: true,
      environments: environmentList,
    });
  }

  @Get('/new')
  @UseGuards(AdminGuard)
  createForm(@Session() session: AppSession, @Res() res: Response): void {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    renderJsx(res, AdminEnvironmentFormPage, {
      username: user.username,
      isAdmin: true,
      environment: null,
    });
  }

  @Post()
  @UseGuards(AdminGuard)
  async create(
    @Session() session: AppSession,
    @Body() dto: CreateEnvironmentDto,
    @Res() response: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const validation = this.validateEnvironment(dto);
    if (!validation.ok) {
      this.renderForm(response, user.username, null, this.formData(dto), validation);
      return;
    }

    const id = await this.environments.create({
      name: dto.name,
      imageRef: dto.imageRef,
      description: dto.description || null,
      pythonVersion: dto.pythonVersion || null,
      packageManifest: dto.packageManifest || '',
      enabled: dto.enabled ?? true,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'environment-create',
      targetType: 'environment_image',
      targetId: id,
      metadata: { name: dto.name, imageRef: dto.imageRef },
    });
    response.redirect('/admin/environments');
  }

  @Post('/validate')
  @UseGuards(AdminGuard)
  validateCreate(
    @Session() session: AppSession,
    @Body() dto: CreateEnvironmentDto,
    @Res() response: Response,
  ): void {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    this.renderForm(
      response,
      user.username,
      null,
      this.formData(dto),
      this.validateEnvironment(dto),
    );
  }

  @Get('/:id/edit')
  @UseGuards(AdminGuard)
  async edit(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const environment = await this.environments.findById(id);
    renderJsx(res, AdminEnvironmentFormPage, {
      username: user.username,
      isAdmin: true,
      environment,
    });
  }

  @Post('/:id')
  @UseGuards(AdminGuard)
  async update(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Body() dto: UpdateEnvironmentDto,
    @Res() response: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const existing = await this.environments.findById(id);
    const formData = { ...(existing ?? {}), ...this.formData(dto), id };
    const validation = this.validateEnvironment(formData);
    if (!validation.ok) {
      this.renderForm(response, user.username, existing, formData, validation);
      return;
    }

    await this.environments.update(id, {
      name: dto.name,
      imageRef: dto.imageRef,
      description: dto.description,
      pythonVersion: dto.pythonVersion,
      packageManifest: dto.packageManifest,
      enabled: dto.enabled,
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'environment-update',
      targetType: 'environment_image',
      targetId: id,
    });
    response.redirect('/admin/environments');
  }

  @Post('/:id/validate')
  @UseGuards(AdminGuard)
  async validateUpdate(
    @Session() session: AppSession,
    @Param('id') id: string,
    @Body() dto: UpdateEnvironmentDto,
    @Res() response: Response,
  ): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    const existing = await this.environments.findById(id);
    const formData = { ...(existing ?? {}), ...this.formData(dto), id };
    this.renderForm(
      response,
      user.username,
      existing,
      formData,
      this.validateEnvironment(formData),
    );
  }

  @Post('/:id/toggle')
  @UseGuards(AdminGuard)
  @Redirect('/admin/environments')
  async toggle(@Session() session: AppSession, @Param('id') id: string): Promise<void> {
    const user = sessionUser(session);
    if (!user) throw new Error('AdminGuard allowed request without session user');
    await this.environments.toggleEnabled(id);
    await this.audit.record({
      actorUserId: user.id,
      action: 'environment-toggle-enabled',
      targetType: 'environment_image',
      targetId: id,
    });
  }

  private renderForm(
    response: Response,
    username: string,
    environment: EnvironmentImage | null,
    formData: EnvironmentFormData,
    validation: ValidationResult,
  ): void {
    renderJsx(response.status(validation.ok ? 200 : 400), AdminEnvironmentFormPage, {
      username,
      isAdmin: true,
      environment,
      formData,
      validation,
    });
  }

  private formData(dto: CreateEnvironmentDto | UpdateEnvironmentDto): EnvironmentFormData {
    return {
      name: dto.name,
      imageRef: dto.imageRef,
      description: dto.description || null,
      pythonVersion: dto.pythonVersion || null,
      packageManifest: dto.packageManifest ?? '',
      enabled: dto.enabled ?? false,
    };
  }

  private validateEnvironment(input: EnvironmentFormData): ValidationResult {
    const messages: string[] = [];
    const imageRef = input.imageRef?.trim() ?? '';
    const pythonVersion = input.pythonVersion?.trim() ?? '';
    const packages = packageLines(input.packageManifest ?? '');

    if (!input.name?.trim()) messages.push('Name is required.');
    if (!imageRef) messages.push('Image ref is required.');
    if (imageRef && !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]+$/.test(imageRef)) {
      messages.push('Image ref contains invalid characters.');
    }
    if (pythonVersion && !/^\d+(\.\d+){0,2}$/.test(pythonVersion)) {
      messages.push('Python version must look like 3, 3.12, or 3.12.4.');
    }
    if (packages.length === 0) messages.push('At least one Python package is required.');
    for (const pkg of packages) {
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*(\[[A-Za-z0-9_,.-]+\])?([<>=!~]=?.+)?$/.test(pkg)) {
        messages.push(`Invalid package entry: ${pkg}`);
      }
    }

    return {
      ok: messages.length === 0,
      messages: messages.length ? messages : ['Environment model is valid.'],
    };
  }
}
