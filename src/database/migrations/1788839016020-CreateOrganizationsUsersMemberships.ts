import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizationsUsersMemberships1788839016020 implements MigrationInterface {
  name = 'CreateOrganizationsUsersMemberships1788839016020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_status_enum" AS ENUM('active', 'suspended', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."organizations_subscription_tier_enum" AS ENUM('free', 'pro', 'enterprise')`,
    );
    await queryRunner.query(
      `CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(255) NOT NULL, "slug" character varying(255) NOT NULL, "status" "public"."organizations_status_enum" NOT NULL DEFAULT 'active', "subscription_tier" "public"."organizations_subscription_tier_enum" NOT NULL DEFAULT 'free', CONSTRAINT "UQ_963693341bd612aa01ddf3a4b68" UNIQUE ("slug"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_963693341bd612aa01ddf3a4b6" ON "organizations"  ("slug") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'locked', 'disabled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "failed_login_attempts" integer NOT NULL DEFAULT '0', "locked_until" TIMESTAMP WITH TIME ZONE, "password_changed_at" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users"  ("email") `,
    );
    await queryRunner.query(
      `CREATE TABLE "memberships" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organization_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role_id" uuid NOT NULL, CONSTRAINT "PK_25d28bd932097a9e90495ede7b4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e5380c394ec7912046d07b5429" ON "memberships"  ("organization_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7c1e2fdfed4f6838e0c05ae505" ON "memberships"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d43d9c8d18fcd49de0fa44bbd7" ON "memberships"  ("organization_id", "user_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d43d9c8d18fcd49de0fa44bbd7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7c1e2fdfed4f6838e0c05ae505"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e5380c394ec7912046d07b5429"`,
    );
    await queryRunner.query(`DROP TABLE "memberships"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_963693341bd612aa01ddf3a4b6"`,
    );
    await queryRunner.query(`DROP TABLE "organizations"`);
    await queryRunner.query(
      `DROP TYPE "public"."organizations_subscription_tier_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."organizations_status_enum"`);
  }
}
