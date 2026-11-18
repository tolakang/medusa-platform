import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118075543 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_review" add column if not exists "reply" text null, add column if not exists "replied_at" timestamptz null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking_review" drop column if exists "reply", drop column if exists "replied_at";`);
  }

}
