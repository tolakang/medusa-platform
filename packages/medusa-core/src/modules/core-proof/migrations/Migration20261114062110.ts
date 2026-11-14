import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261114062110 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "core_proof_item" ("id" text not null, "label" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "core_proof_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_core_proof_item_deleted_at" ON "core_proof_item" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "core_proof_item" cascade;`);
  }

}
