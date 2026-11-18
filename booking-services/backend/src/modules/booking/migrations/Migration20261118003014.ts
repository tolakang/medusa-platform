import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118003014 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking_resource" add column if not exists "telegram_chat_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking_resource" drop column if exists "telegram_chat_id";`);
  }

}
