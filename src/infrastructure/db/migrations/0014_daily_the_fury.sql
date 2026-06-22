CREATE TYPE "public"."runtime_image_worker_status" AS ENUM('pending', 'building', 'ready', 'failed', 'removing');--> statement-breakpoint
CREATE TABLE "runtime_image_worker_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"runtime_image_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"image_ref" text NOT NULL,
	"image_hash" text NOT NULL,
	"image_id" text,
	"artifact_sha256" text,
	"status" "runtime_image_worker_status" DEFAULT 'pending' NOT NULL,
	"failure_reason" text,
	"checked_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtime_image_worker_statuses" ADD CONSTRAINT "runtime_image_worker_statuses_runtime_image_id_runtime_images_id_fk" FOREIGN KEY ("runtime_image_id") REFERENCES "public"."runtime_images"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runtime_image_worker_statuses" ADD CONSTRAINT "runtime_image_worker_statuses_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "runtime_image_worker_statuses_runtime_worker_hash_unique" ON "runtime_image_worker_statuses" USING btree ("runtime_image_id","worker_id","image_hash");