ALTER TABLE "retention_settings" ADD COLUMN "idle_stop_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "retention_settings" ADD COLUMN "idle_timeout_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_activity_at" timestamp with time zone;