import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261117220514 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "booking_quote" ("id" text not null, "customer_id" text not null, "variant_id" text not null, "details" text not null, "address" text null, "dropoff_address" text null, "wished_starts_at" timestamptz not null, "status" text check ("status" in ('requested', 'quoted', 'accepted', 'declined', 'expired')) not null default 'requested', "amount" numeric null, "currency_code" text null, "resource_id" text null, "starts_at" timestamptz null, "ends_at" timestamptz null, "reply" text null, "valid_until" timestamptz null, "booking_id" text null, "raw_amount" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_quote_pkey" primary key ("id"), constraint booking_quote_amount_not_negative check (amount IS NULL OR amount >= 0));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_quote_deleted_at" ON "booking_quote" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_quote_customer_id" ON "booking_quote" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_quote_status" ON "booking_quote" ("status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_quote" cascade;`);
  }

}
