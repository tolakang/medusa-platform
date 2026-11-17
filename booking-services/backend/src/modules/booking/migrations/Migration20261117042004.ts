import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261117042004 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_zone_price" drop constraint if exists "booking_zone_price_variant_id_from_zone_id_to_zone_id_unique";`);
    this.addSql(`alter table if exists "booking_zone" drop constraint if exists "booking_zone_name_unique";`);
    this.addSql(`create table if not exists "booking_zone" ("id" text not null, "name" text not null, "rank" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_zone_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_zone_deleted_at" ON "booking_zone" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_zone_name_unique" ON "booking_zone" ("name") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "booking_zone_price" ("id" text not null, "variant_id" text not null, "amount" numeric not null, "currency_code" text not null, "minutes" integer not null, "from_zone_id" text not null, "to_zone_id" text not null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_zone_price_pkey" primary key ("id"), constraint booking_zone_price_amount_not_negative check (amount >= 0), constraint booking_zone_price_minutes_range check (minutes >= 5 AND minutes <= 1440));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_zone_price_from_zone_id" ON "booking_zone_price" ("from_zone_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_zone_price_to_zone_id" ON "booking_zone_price" ("to_zone_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_zone_price_deleted_at" ON "booking_zone_price" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_zone_price_variant_id_from_zone_id_to_zone_id_unique" ON "booking_zone_price" ("variant_id", "from_zone_id", "to_zone_id") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "booking_zone_price" add constraint "booking_zone_price_from_zone_id_foreign" foreign key ("from_zone_id") references "booking_zone" ("id") on update cascade;`);
    this.addSql(`alter table if exists "booking_zone_price" add constraint "booking_zone_price_to_zone_id_foreign" foreign key ("to_zone_id") references "booking_zone" ("id") on update cascade;`);

    this.addSql(`alter table if exists "booking" add column if not exists "dropoff_address" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking_zone_price" drop constraint if exists "booking_zone_price_from_zone_id_foreign";`);

    this.addSql(`alter table if exists "booking_zone_price" drop constraint if exists "booking_zone_price_to_zone_id_foreign";`);

    this.addSql(`drop table if exists "booking_zone" cascade;`);

    this.addSql(`drop table if exists "booking_zone_price" cascade;`);

    this.addSql(`alter table if exists "booking" drop column if exists "dropoff_address";`);
  }

}
