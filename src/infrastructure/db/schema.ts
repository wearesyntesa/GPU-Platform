import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['user', 'admin']);
export const userStatus = pgEnum('user_status', ['active', 'disabled']);
export const requestStatus = pgEnum('request_status', [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'expired',
  'superseded',
]);
export const sessionStatus = pgEnum('session_status', [
  'starting',
  'running',
  'stopping',
  'stopped',
  'failed',
  'expired',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: text('full_name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  role: userRole('role').notNull().default('user'),
  status: userStatus('status').notNull().default('active'),
  ...timestamps,
});

export const platformSettings = pgTable('platform_settings', {
  id: text('id').primaryKey().default('settings'),
  selfRegistrationEnabled: boolean('self_registration_enabled').notNull().default(false),
  requireInvitation: boolean('require_invitation').notNull().default(true),
  maxRequestCpu: integer('max_request_cpu').notNull().default(128),
  maxRequestMemoryGb: integer('max_request_memory_gb').notNull().default(1024),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userInvitations = pgTable('user_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: text('token').notNull().unique(),
  email: text('email'),
  role: userRole('role').notNull().default('user'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  usedBy: uuid('used_by').references(() => users.id),
  usedAt: timestamp('used_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workers = pgTable('workers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  swarmNodeId: text('swarm_node_id').unique(),
  address: text('address').notNull(),
  gpuType: text('gpu_type').notNull(),
  gpuCount: integer('gpu_count').notNull().default(1),
  vramGb: integer('vram_gb'),
  cpuTotal: integer('cpu_total'),
  memoryTotalGb: integer('memory_total_gb'),
  enabled: boolean('enabled').notNull().default(true),
  maintenance: boolean('maintenance').notNull().default(false),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  ...timestamps,
});

export const runtimeImages = pgTable('runtime_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  imageRef: text('image_ref').notNull(),
  description: text('description'),
  pythonVersion: text('python_version'),
  packageManifest: text('package_manifest').notNull().default(''),
  enabled: boolean('enabled').notNull().default(true),
  ...timestamps,
});

export const sessionRequests = pgTable(
  'session_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    runtimeImageId: uuid('runtime_image_id')
      .notNull()
      .references(() => runtimeImages.id),
    gpuTarget: text('gpu_target').notNull(),
    requestedCpu: integer('requested_cpu').notNull(),
    requestedMemoryGb: integer('requested_memory_gb').notNull(),
    purpose: text('purpose'),
    status: requestStatus('status').notNull().default('pending'),
    decisionReason: text('decision_reason'),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('session_requests_one_live_per_user')
      .on(table.userId)
      .where(sql`status in ('pending', 'approved')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => sessionRequests.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    workerId: uuid('worker_id').references(() => workers.id),
    runtimeImageId: uuid('runtime_image_id')
      .notNull()
      .references(() => runtimeImages.id),
    swarmServiceId: text('swarm_service_id'),
    swarmServiceName: text('swarm_service_name').unique(),
    swarmTaskId: text('swarm_task_id'),
    containerId: text('container_id'),
    proxyPath: text('proxy_path').unique(),
    jupyterTokenHash: text('jupyter_token_hash'),
    publishedPort: integer('published_port'),
    status: sessionStatus('status').notNull().default('starting'),
    failureReason: text('failure_reason'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { withTimezone: true }),
    stopReason: text('stop_reason'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('sessions_one_live_workspace_per_user')
      .on(table.userId)
      .where(sql`status in ('starting', 'running', 'stopping')`),
    uniqueIndex('sessions_one_live_workspace_per_worker')
      .on(table.workerId)
      .where(sql`worker_id is not null and status in ('starting', 'running', 'stopping')`),
    uniqueIndex('sessions_one_live_workspace_per_port')
      .on(table.publishedPort)
      .where(sql`published_port is not null and status in ('starting', 'running', 'stopping')`),
  ],
);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id'),
  metadata: jsonb('metadata')
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const retentionSettings = pgTable('retention_settings', {
  id: text('id').primaryKey().default('settings'),
  enabled: boolean('enabled').notNull().default(false),
  auditLogDays: integer('audit_log_days').notNull().default(90),
  workspaceDays: integer('workspace_days').notNull().default(90),
  accessRequestDays: integer('access_request_days').notNull().default(90),
  idleStopEnabled: boolean('idle_stop_enabled').notNull().default(true),
  idleTimeoutMinutes: integer('idle_timeout_minutes').notNull().default(30),
  batchSize: integer('batch_size').notNull().default(500),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userRelations = relations(users, ({ many }) => ({
  requests: many(sessionRequests),
  sessions: many(sessions),
  invitationsCreated: many(userInvitations, { relationName: 'created' }),
}));

export const userInvitationRelations = relations(userInvitations, ({ one }) => ({
  createdByUser: one(users, {
    fields: [userInvitations.createdBy],
    references: [users.id],
    relationName: 'created',
  }),
  usedByUser: one(users, { fields: [userInvitations.usedBy], references: [users.id] }),
}));

export const runtimeImageRelations = relations(runtimeImages, ({ many }) => ({
  requests: many(sessionRequests),
  sessions: many(sessions),
}));
