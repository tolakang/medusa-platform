import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261125092149 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "seller_adjustment" ("id" text not null, "order_id" text null, "commission_id" text null, "amount" numeric not null, "currency_code" text not null, "reason" text not null, "status" text check ("status" in ('open', 'settled')) not null default 'open', "payout_id" text null, "seller_id" text not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_adjustment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_adjustment_seller_id" ON "seller_adjustment" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_adjustment_deleted_at" ON "seller_adjustment" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "seller_payout" ("id" text not null, "currency_code" text not null, "amount" numeric not null, "commission_total" numeric not null, "adjustment_total" numeric not null, "commission_count" integer not null, "reference" text null, "paid_at" timestamptz not null, "seller_id" text not null, "raw_amount" jsonb not null, "raw_commission_total" jsonb not null, "raw_adjustment_total" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "seller_payout_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_payout_seller_id" ON "seller_payout" ("seller_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_seller_payout_deleted_at" ON "seller_payout" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "seller_adjustment" add constraint "seller_adjustment_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "seller_payout" add constraint "seller_payout_seller_id_foreign" foreign key ("seller_id") references "seller" ("id") on update cascade;`);

    this.addSql(`alter table if exists "seller" add column if not exists "accepted_at" timestamptz null, add column if not exists "payout_hold" boolean not null default false, add column if not exists "phone" text null, add column if not exists "telegram" text null, add column if not exists "payout_bank_name" text null, add column if not exists "payout_account_name" text null, add column if not exists "payout_account_number" text null;`);

    // Sellers who already accepted (an auth identity carries their id) are
    // not "Invited". Read-only on the Auth Module's table, only if it exists.
    this.addSql(`do $$ begin if to_regclass('public.auth_identity') is not null then update "seller" s set "accepted_at" = now() where s."accepted_at" is null and exists (select 1 from auth_identity a where a.app_metadata->>'seller_id' = s.id and a.deleted_at is null); end if; end $$;`);

    this.addSql(`alter table if exists "seller_commission" add column if not exists "refunded_total" numeric null, add column if not exists "adjusted_base" numeric null, add column if not exists "raw_refunded_total" jsonb null, add column if not exists "raw_adjusted_base" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "seller_adjustment" cascade;`);

    this.addSql(`drop table if exists "seller_payout" cascade;`);

    this.addSql(`alter table if exists "seller" drop column if exists "accepted_at", drop column if exists "payout_hold", drop column if exists "phone", drop column if exists "telegram", drop column if exists "payout_bank_name", drop column if exists "payout_account_name", drop column if exists "payout_account_number";`);

    this.addSql(`alter table if exists "seller_commission" drop column if exists "refunded_total", drop column if exists "adjusted_base", drop column if exists "raw_refunded_total", drop column if exists "raw_adjusted_base";`);
  }

}
