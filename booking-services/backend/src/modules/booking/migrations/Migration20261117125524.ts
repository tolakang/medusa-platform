import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261117125524 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_ticket" drop constraint if exists "booking_ticket_code_unique";`);
    this.addSql(`create table if not exists "booking_ticket" ("id" text not null, "code" text not null, "order_id" text not null, "line_item_id" text not null, "variant_id" text null, "event_title" text not null, "label" text not null, "event_starts_at" timestamptz null, "status" text check ("status" in ('valid', 'used')) not null default 'valid', "used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_ticket_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_ticket_deleted_at" ON "booking_ticket" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_ticket_code_unique" ON "booking_ticket" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_ticket_order_id" ON "booking_ticket" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_ticket_line_item_id" ON "booking_ticket" ("line_item_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_ticket" cascade;`);
  }

}
