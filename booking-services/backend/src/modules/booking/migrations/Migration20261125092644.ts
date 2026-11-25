import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261125092644 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_provider" add column if not exists "status_reason" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking_provider" drop column if exists "status_reason";`);
  }

}
