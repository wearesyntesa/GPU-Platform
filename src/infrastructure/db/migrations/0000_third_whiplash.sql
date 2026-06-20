CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('starting', 'running', 'stopping', 'stopped', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_ref" text NOT NULL,
	"description" text,
	"python_version" text,
	"package_manifest" text DEFAULT '' NOT NULL,
	"dockerfile" text DEFAULT '' NOT NULL,
	"build_notes" text DEFAULT '' NOT NULL,
	"is_gpu_image" boolean DEFAULT true NOT NULL,
	"default_cpu" integer DEFAULT 2 NOT NULL,
	"default_memory_gb" integer DEFAULT 4 NOT NULL,
	"default_hours" integer DEFAULT 2 NOT NULL,
	"max_cpu" integer DEFAULT 8 NOT NULL,
	"max_memory_gb" integer DEFAULT 32 NOT NULL,
	"max_hours" integer DEFAULT 8 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_template_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runtime_image_id" uuid NOT NULL,
	"manager" text NOT NULL,
	"name" text NOT NULL,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"runtime_image_id" uuid NOT NULL,
	"gpu_target" text NOT NULL,
	"requested_cpu" integer NOT NULL,
	"requested_memory_gb" integer NOT NULL,
	"requested_hours" integer NOT NULL,
	"purpose" text,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"decision_reason" text,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"worker_id" uuid,
	"runtime_image_id" uuid NOT NULL,
	"swarm_service_id" text,
	"swarm_service_name" text,
	"swarm_task_id" text,
	"container_id" text,
	"proxy_path" text,
	"jupyter_token_hash" text,
	"published_port" integer,
	"status" "session_status" DEFAULT 'starting' NOT NULL,
	"failure_reason" text,
	"started_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"stop_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_swarm_service_name_unique" UNIQUE("swarm_service_name"),
	CONSTRAINT "sessions_proxy_path_unique" UNIQUE("proxy_path")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'student' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"swarm_node_id" text,
	"address" text NOT NULL,
	"gpu_type" text NOT NULL,
	"gpu_count" integer DEFAULT 1 NOT NULL,
	"vram_gb" integer,
	"cpu_total" integer,
	"memory_total_gb" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"maintenance" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_name_unique" UNIQUE("name"),
	CONSTRAINT "workers_swarm_node_id_unique" UNIQUE("swarm_node_id")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_template_packages" ADD CONSTRAINT "runtime_template_packages_runtime_image_id_runtime_images_id_fk" FOREIGN KEY ("runtime_image_id") REFERENCES "public"."runtime_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_requests" ADD CONSTRAINT "session_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_requests" ADD CONSTRAINT "session_requests_runtime_image_id_runtime_images_id_fk" FOREIGN KEY ("runtime_image_id") REFERENCES "public"."runtime_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_requests" ADD CONSTRAINT "session_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_request_id_session_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."session_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_runtime_image_id_runtime_images_id_fk" FOREIGN KEY ("runtime_image_id") REFERENCES "public"."runtime_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "session_requests_one_live_per_user" ON "session_requests" USING btree ("user_id") WHERE status in ('pending', 'approved');--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_live_workspace_per_user" ON "sessions" USING btree ("user_id") WHERE status in ('starting', 'running', 'stopping');