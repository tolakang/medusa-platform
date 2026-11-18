import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261118011655 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "booking_review" ("id" text not null, "booking_id" text not null, "customer_id" text not null, "product_id" text not null, "resource_id" text null, "rating" integer not null, "comment" text null, "author" text null, "status" text check ("status" in ('published', 'hidden')) not null default 'published', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "booking_review_pkey" primary key ("id"), constraint booking_review_rating_check check (rating >= 1 AND rating <= 5));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_review_deleted_at" ON "booking_review" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_booking_review_booking" ON "booking_review" ("booking_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_booking_review_product_status" ON "booking_review" ("product_id", "status") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "booking_review" cascade;`);
  }

}
