import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import session = require('express-session');
import connectPg = require('connect-pg-simple');
import { Pool } from 'pg';
import type { NextFunction, Request, Response } from 'express';
import { appVersion } from '@/core/app-info';
import { AppModule } from '@/app.module';
import { env } from '@/core/config/env';
import { HtmlExceptionFilter } from '@/core/filters/html-exception.filter';
import { authRateLimit, csrfProtection, securityHeaders } from '@/core/security';

function publicPath(): string {
  const paths = [join(process.cwd(), 'public'), join(__dirname, '..', 'public')];
  const found = paths.find((path) => existsSync(path));
  if (!found) throw new Error(`None of these paths exist: ${paths.join(', ')}`);
  return found;
}

const version = appVersion();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);

  app.use(securityHeaders);
  app.useStaticAssets(publicPath());
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.locals.appVersion = version;
    next();
  });

  const PgSession = connectPg(session);
  const sessionPool = new Pool({
    connectionString: env.databaseUrl,
    max: env.sessionDatabasePoolMax,
  });

  app.use(
    session({
      name: 'rpl.sid',
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      proxy: env.trustProxy !== false,
      store: new PgSession({
        pool: sessionPool,
        tableName: 'user_sessions',
        createTableIfMissing: true,
      }),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.appUrl.startsWith('https://'),
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );
  app.use(csrfProtection);
  app.use(authRateLimit);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HtmlExceptionFilter());

  await app.listen(env.port, '0.0.0.0');
}

void bootstrap();
