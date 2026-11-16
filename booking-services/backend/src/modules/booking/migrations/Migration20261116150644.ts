import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261116150644 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_provider" drop constraint if exists "booking_provider_handle_unique";`);
    this.addSql(`alter table if exists "booking_provider" drop constraint if exists "booking_provider_email_unique";`);
    this.addSql(`create table if not exists "booking_provider" ("id" text not null, "role" text check ("role" in ('staff', 'partner')) not null, "status" text check ("status" in ('invited', 'pending', 'active', 'suspended')) not null, "email" text not null, "name" text not null, "handle" text not null, "phone" text null, "bio" text null, "photo" text null, "area" text null, "commission_rate" real null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_provider_pkey" primary key ("id"), constraint booking_provider_handle_format check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*\$'), constraint booking_provider_commission_rate_percent check (commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 100)));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_provider_deleted_at" ON "booking_provider" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_provider_email_unique" ON "booking_provider" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_provider_handle_unique" ON "booking_provider" ("handle") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "booking_resource" add column if not exists "provider_id" text null;`);
    this.addSql(`alter table if exists "booking_resource" add constraint "booking_resource_provider_id_foreign" foreign key ("provider_id") references "booking_provider" ("id") on update cascade on delete set null;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_resource_provider_id" ON "booking_resource" ("provider_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking_resource" drop constraint if exists "booking_resource_provider_id_foreign";`);

    this.addSql(`drop table if exists "booking_provider" cascade;`);

    this.addSql(`drop index if exists "IDX_booking_resource_provider_id";`);
    this.addSql(`alter table if exists "booking_resource" drop column if exists "provider_id";`);
  }

}
