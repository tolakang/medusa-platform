import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261117120345 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_resource" add column if not exists "whole_days" boolean not null default false;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking_resource" drop column if exists "whole_days";`);
  }

}
