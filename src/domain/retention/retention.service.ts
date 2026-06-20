import { Injectable } from '@nestjs/common';
import { RetentionRepository } from './retention.repository';

export interface RetentionSettingsValue {
  enabled: boolean;
  auditLogDays: number;
  workspaceDays: number;
  accessRequestDays: number;
  idleStopEnabled: boolean;
  idleTimeoutMinutes: number;
  batchSize: number;
}

export interface RetentionDryRunResult {
  auditLogs: number;
  terminalWorkspaces: number;
  terminalAccessRequests: number;
  expiredUserSessions: number;
  total: number;
}

const defaultSettings: RetentionSettingsValue = {
  enabled: false,
  auditLogDays: 90,
  workspaceDays: 90,
  accessRequestDays: 90,
  idleStopEnabled: true,
  idleTimeoutMinutes: 30,
  batchSize: 500,
};

@Injectable()
export class RetentionService {
  constructor(private readonly retentionRepository: RetentionRepository) {}

  async getSettings(): Promise<RetentionSettingsValue> {
    return (await this.retentionRepository.getSettings()) ?? defaultSettings;
  }

  async saveSettings(settings: RetentionSettingsValue, updatedBy: string): Promise<void> {
    await this.retentionRepository.saveSettings(settings, updatedBy);
  }

  async dryRun(settings = defaultSettings): Promise<RetentionDryRunResult> {
    if (!settings.enabled) return this.emptyDryRun();
    const [auditCount, workspaceCount, requestCount, sessionCount] = await Promise.all([
      this.countAuditLogs(settings.auditLogDays),
      this.countTerminalWorkspaces(settings.workspaceDays),
      this.countTerminalAccessRequests(settings.accessRequestDays),
      this.countExpiredUserSessions(),
    ]);
    return {
      auditLogs: auditCount,
      terminalWorkspaces: workspaceCount,
      terminalAccessRequests: requestCount,
      expiredUserSessions: sessionCount,
      total: auditCount + workspaceCount + requestCount + sessionCount,
    };
  }

  private emptyDryRun(): RetentionDryRunResult {
    return {
      auditLogs: 0,
      terminalWorkspaces: 0,
      terminalAccessRequests: 0,
      expiredUserSessions: 0,
      total: 0,
    };
  }

  private async countAuditLogs(days: number): Promise<number> {
    return this.retentionRepository.countAuditLogs(days);
  }

  private async countTerminalWorkspaces(days: number): Promise<number> {
    return this.retentionRepository.countTerminalWorkspaces(days);
  }

  private async countTerminalAccessRequests(days: number): Promise<number> {
    return this.retentionRepository.countTerminalAccessRequests(days);
  }

  private async countExpiredUserSessions(): Promise<number> {
    return this.retentionRepository.countExpiredUserSessions();
  }
}
