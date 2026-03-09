CREATE TABLE "pull_request_reviews" (
	"id" bigint PRIMARY KEY NOT NULL,
	"pull_request_id" bigint NOT NULL,
	"repository_id" integer NOT NULL,
	"reviewer" text,
	"state" text,
	"submitted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "terraform_modules" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "terraform_registry_releases" ADD COLUMN "latest_version" text;--> statement-breakpoint
ALTER TABLE "tracker_requests" ADD COLUMN "is_closed" text;--> statement-breakpoint
ALTER TABLE "tracker_requests" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_request_reviews" ADD CONSTRAINT "pull_request_reviews_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prr_pr_idx" ON "pull_request_reviews" USING btree ("pull_request_id");--> statement-breakpoint
CREATE INDEX "prr_repo_idx" ON "pull_request_reviews" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "prr_submitted_at_idx" ON "pull_request_reviews" USING btree ("submitted_at");