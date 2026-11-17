import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261116235229 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "address" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop column if exists "address";`);
  }

}
