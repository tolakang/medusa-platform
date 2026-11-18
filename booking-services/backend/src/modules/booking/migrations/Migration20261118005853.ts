import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118005853 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "booking_waitlist" ("id" text not null, "customer_id" text not null, "variant_id" text not null, "date" text not null, "status" text check ("status" in ('waiting', 'notified', 'cancelled')) not null default 'waiting', "notified_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_waitlist_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_waitlist_deleted_at" ON "booking_waitlist" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_waitlist_status_date" ON "booking_waitlist" ("status", "date") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_waitlist_customer" ON "booking_waitlist" ("customer_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_waitlist" cascade;`);
  }

}
