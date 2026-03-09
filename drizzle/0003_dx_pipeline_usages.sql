CREATE TABLE "dx_pipeline_usages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dx_pipeline_usages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"repository" text NOT NULL,
	"caller_file" text NOT NULL,
	"dx_workflow" text NOT NULL,
	"ref" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dx_pipeline_repo_file_wf_idx" ON "dx_pipeline_usages" USING btree ("repository","caller_file","dx_workflow");