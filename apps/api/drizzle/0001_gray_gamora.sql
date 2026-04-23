DROP INDEX "messages_chat_window_id_idx";--> statement-breakpoint
CREATE INDEX "messages_chat_window_id_created_at_idx" ON "messages" USING btree ("chat_window_id","created_at");