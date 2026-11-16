import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261116231444 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_commission" drop constraint if exists "booking_commission_booking_id_unique";`);
    this.addSql(`alter table if exists "booking_payout" drop constraint if exists "booking_payout_provider_id_period_currency_code_unique";`);
    this.addSql(`create table if not exists "booking_payout" ("id" text not null, "amount" numeric not null, "currency_code" text not null, "period" text not null, "status" text check ("status" in ('pending', 'paid', 'cancelled')) not null default 'pending', "paid_at" timestamptz null, "reference" text null, "provider_id" text not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_payout_pkey" primary key ("id"), constraint booking_payout_amount_not_negative check (amount >= 0), constraint booking_payout_period_format check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])\$'));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_payout_provider_id" ON "booking_payout" ("provider_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_payout_deleted_at" ON "booking_payout" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_payout_provider_id_period_currency_code_unique" ON "booking_payout" ("provider_id", "period", "currency_code") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "booking_commission" ("id" text not null, "booking_id" text not null, "order_id" text not null, "line_item_id" text null, "line_total" numeric not null, "base" numeric not null, "rate" real not null, "amount" numeric not null, "payout_amount" numeric not null, "currency_code" text not null, "status" text check ("status" in ('pending', 'approved', 'paid', 'cancelled')) not null default 'pending', "payout_id" text null, "refunded_amount" numeric not null default 0, "refund_review" text check ("refund_review" in ('none', 'to_review', 'settled')) not null default 'none', "provider_id" text not null, "raw_line_total" jsonb not null, "raw_base" jsonb not null, "raw_amount" jsonb not null, "raw_payout_amount" jsonb not null, "raw_refunded_amount" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_commission_pkey" primary key ("id"), constraint booking_commission_rate_percent check (rate >= 0 AND rate <= 100), constraint booking_commission_amounts_not_negative check (amount >= 0 AND base >= 0 AND line_total >= 0 AND payout_amount >= 0));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_commission_provider_id" ON "booking_commission" ("provider_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_commission_deleted_at" ON "booking_commission" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_commission_booking_id_unique" ON "booking_commission" ("booking_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_commission_order_id" ON "booking_commission" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "booking_payout" add constraint "booking_payout_provider_id_foreign" foreign key ("provider_id") references "booking_provider" ("id") on update cascade;`);

    this.addSql(`alter table if exists "booking_commission" add constraint "booking_commission_provider_id_foreign" foreign key ("provider_id") references "booking_provider" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_payout" cascade;`);

    this.addSql(`drop table if exists "booking_commission" cascade;`);
  }

}
