import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118084335 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_pass_use" add column if not exists "credits" integer not null default 1;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking_pass_use" drop column if exists "credits";`);
  }

}
