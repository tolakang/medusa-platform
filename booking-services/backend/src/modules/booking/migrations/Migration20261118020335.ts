import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118020335 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "booking_pass" ("id" text not null, "customer_id" text not null, "order_id" text not null, "line_item_id" text not null, "product_id" text not null, "title" text not null, "credits_total" integer not null, "credits_left" integer not null, "expires_at" timestamptz not null, "product_ids" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_pass_pkey" primary key ("id"), constraint booking_pass_credits_check check (credits_left >= 0 AND credits_left <= credits_total));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_pass_deleted_at" ON "booking_pass" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_pass_line_item" ON "booking_pass" ("line_item_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_pass_customer" ON "booking_pass" ("customer_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "booking_pass_use" ("id" text not null, "pass_id" text not null, "booking_id" text not null, "status" text check ("status" in ('used', 'returned')) not null default 'used', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_pass_use_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_pass_use_deleted_at" ON "booking_pass_use" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_pass_use_booking" ON "booking_pass_use" ("booking_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_pass" cascade;`);

    this.addSql(`drop table if exists "booking_pass_use" cascade;`);
  }

}
