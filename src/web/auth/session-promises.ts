import type { Request } from 'express';
import type { AppSession } from '@/core/session';

export function regenerateSession(request: Request & { session: AppSession }): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export function saveSession(request: Request & { session: AppSession }): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
