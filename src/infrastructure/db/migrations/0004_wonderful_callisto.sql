CREATE TABLE "retention_settings" (
	"id" text PRIMARY KEY DEFAULT 'settings' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"audit_log_days" integer DEFAULT 90 NOT NULL,
	"workspace_days" integer DEFAULT 90 NOT NULL,
	"access_request_days" integer DEFAULT 90 NOT NULL,
	"batch_size" integer DEFAULT 500 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retention_settings" ADD CONSTRAINT "retention_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;