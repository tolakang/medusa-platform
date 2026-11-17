import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261117121926 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "booking" add column if not exists "seats" integer not null default 1;`);
    this.addSql(`alter table if exists "booking" add constraint booking_seats_positive check(seats >= 1);`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "booking" drop constraint if exists booking_seats_positive;`);
    this.addSql(`alter table if exists "booking" drop column if exists "seats";`);
  }

}
