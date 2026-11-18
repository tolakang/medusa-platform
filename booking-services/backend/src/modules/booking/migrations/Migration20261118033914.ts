import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118033914 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "series_id" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop column if exists "series_id";`);
  }

}
