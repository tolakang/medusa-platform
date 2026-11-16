import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261116155943 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_day_off" drop constraint if exists "booking_day_off_resource_id_date_unique";`);
    this.addSql(`create table if not exists "booking_day_off" ("id" text not null, "date" text not null, "resource_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_day_off_pkey" primary key ("id"), constraint booking_day_off_date_format check (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}\$'));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_day_off_resource_id" ON "booking_day_off" ("resource_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_day_off_deleted_at" ON "booking_day_off" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_day_off_resource_id_date_unique" ON "booking_day_off" ("resource_id", "date") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "booking_day_off" add constraint "booking_day_off_resource_id_foreign" foreign key ("resource_id") references "booking_resource" ("id") on update cascade on delete cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_day_off" cascade;`);
  }

}
