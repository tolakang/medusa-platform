import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118044257 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "package_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop column if exists "package_id";`);
  }

}
