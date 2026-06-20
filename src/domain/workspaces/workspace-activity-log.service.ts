import { Injectable, Logger } from '@nestjs/common';
import { open, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { env } from '@/core/config/env';
import { WorkspacesService } from './workspaces.service';

type CaddyAccessLog = {
  request?: { uri?: unknown };
};

const workspaceUriPattern = /^\/workspaces\/([0-9a-f-]{36})(?:\/|$)/i;

export function workspaceSessionIdFromAccessLogLine(line: string): string | null {
  try {
    const entry = JSON.parse(line) as CaddyAccessLog;
    const uri = typeof entry.request?.uri === 'string' ? entry.request.uri : null;
    if (!uri) return null;
    return uri.match(workspaceUriPattern)?.[1] ?? null;
  } catch {
    return null;
  }
}

@Injectable()
export class WorkspaceActivityLogService {
  private readonly logger = new Logger(WorkspaceActivityLogService.name);
  private readonly accessLogPath = resolve(env.caddyAccessLogPath);
  private offset = 0;
  private missingLogWarned = false;

  constructor(private readonly workspacesService: WorkspacesService) {}

  async ingest(): Promise<number> {
    let fileSize: number;
    try {
      fileSize = (await stat(this.accessLogPath)).size;
    } catch {
      if (!this.missingLogWarned) {
        this.logger.warn(
          `Caddy access log not found at ${this.accessLogPath}; idle activity tracking waits for log file`,
        );
        this.missingLogWarned = true;
      }
      return 0;
    }

    if (fileSize < this.offset) this.offset = 0;
    if (fileSize === this.offset) return 0;

    const handle = await open(this.accessLogPath, 'r');
    let slice: string;
    try {
      const length = fileSize - this.offset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, this.offset);
      slice = buffer.toString('utf8');
    } finally {
      await handle.close();
    }
    this.offset = fileSize;

    const sessionIds = slice
      .split(/\r?\n/)
      .map(workspaceSessionIdFromAccessLogLine)
      .filter((id): id is string => id !== null);

    return this.workspacesService.markActivity(sessionIds);
  }
}
