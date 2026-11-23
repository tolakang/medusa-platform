import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261123074723 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "price" numeric null, add column if not exists "raw_price" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop column if exists "price", drop column if exists "raw_price";`);
  }

}
