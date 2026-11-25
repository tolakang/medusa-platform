import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261125213313 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "walk_in_name" text null, add column if not exists "walk_in_phone" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop column if exists "walk_in_name", drop column if exists "walk_in_phone";`);
  }

}
