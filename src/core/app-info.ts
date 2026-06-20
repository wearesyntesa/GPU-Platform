import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function firstExistingPath(paths: string[]): string | null {
  return paths.find((path) => existsSync(path)) ?? null;
}

function packageJsonPath(): string | null {
  return firstExistingPath([
    join(process.cwd(), 'package.json'),
    join(__dirname, '..', 'package.json'),
    join(__dirname, '..', '..', 'package.json'),
  ]);
}

export function appVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  const path = packageJsonPath();
  if (!path) return '0.1.0';
  try {
    const packageJson = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
    return packageJson.version;
  } catch {
    return '0.1.0';
  }
}

export function appRevision(): string | null {
  return process.env.APP_REVISION ?? process.env.GIT_SHA ?? null;
}

export function appBuildTime(): string | null {
  return process.env.APP_BUILD_TIME ?? null;
}

const pageGeneratedAtFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Jakarta',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export function pageGeneratedAt(): string {
  const parts = pageGeneratedAtFormatter.formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')} ${get('hour')}:${get('minute')}:${get('second')} WIB`;
}
