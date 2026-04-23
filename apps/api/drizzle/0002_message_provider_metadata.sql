ALTER TABLE "messages" ADD COLUMN "provider" "ai_provider";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "latency_ms" integer;
