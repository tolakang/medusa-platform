import { Migration } from "@medusajs/framework/mikro-orm/migrations";

// Vendor contact and payout details (vendor settings, 2026-11-25).
export class Migration20261125090000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor" add column if not exists "description" text null, add column if not exists "phone" text null, add column if not exists "telegram" text null, add column if not exists "payout_account" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor" drop column if exists "description", drop column if exists "phone", drop column if exists "telegram", drop column if exists "payout_account";`);
  }

}
