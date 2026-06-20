import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppSession } from '@/core/session';

type SessionRequest = Request & { session?: AppSession };

interface RateBucket {
  count: number;
  resetAt: number;
}

const csrfSafeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
const authRateBuckets = new Map<string, RateBucket>();
const authRateLimitedPaths = new Set(['/login', '/register']);

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
    ].join('; '),
  );
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

export function csrfProtection(req: SessionRequest, res: Response, next: NextFunction): void {
  const session = req.session;
  if (!session) {
    next();
    return;
  }

  if (!session.csrfToken) session.csrfToken = randomBytes(32).toString('hex');
  res.locals.csrfToken = session.csrfToken;

  if (csrfSafeMethods.has(req.method)) {
    next();
    return;
  }

  const submitted = submittedCsrfToken(req);
  if (!submitted || !tokensEqual(submitted, session.csrfToken)) {
    res.status(403).type('text').send('Invalid CSRF token');
    return;
  }

  next();
}

export function authRateLimit(req: Request, res: Response, next: NextFunction): void {
  if (!authRateLimitedPaths.has(req.path) || req.method !== 'POST') {
    next();
    return;
  }

  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 20;
  const key = `${req.ip}:${req.path}`;
  const bucket = authRateBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    authRateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    next();
    return;
  }

  bucket.count += 1;
  if (bucket.count > maxAttempts) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
    res.status(429).type('text').send('Too many attempts. Try again later.');
    return;
  }

  next();
}

function submittedCsrfToken(req: Request): string | null {
  const body = req.body as Record<string, unknown> | undefined;
  const bodyToken = body?._csrf;
  if (typeof bodyToken === 'string') return bodyToken;
  const headerToken = req.header('x-csrf-token');
  return headerToken ?? null;
}

function tokensEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
