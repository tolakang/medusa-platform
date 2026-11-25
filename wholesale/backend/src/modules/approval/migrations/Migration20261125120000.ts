import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261125120000 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "approval" add column if not exists "covered_total" numeric null, add column if not exists "raw_covered_total" jsonb null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "approval" drop column if exists "covered_total", drop column if exists "raw_covered_total";`);
  }

}
