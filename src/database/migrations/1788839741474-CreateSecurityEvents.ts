import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSecurityEvents1788839741474 implements MigrationInterface {
  name = 'CreateSecurityEvents1788839741474';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "security_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "org_id" uuid, "user_id" uuid, "type" character varying(64) NOT NULL, "ip" character varying(64), "user_agent" character varying(512), "metadata" jsonb, CONSTRAINT "PK_6fc100d6700780737348df0d3ae" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bbaff9782f7abe95d9f9cec9ea" ON "security_events"  ("org_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d1891b273f5c77638d2149a9f0" ON "security_events"  ("user_id") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d1891b273f5c77638d2149a9f0"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_bbaff9782f7abe95d9f9cec9ea"`,
    );
    await queryRunner.query(`DROP TABLE "security_events"`);
  }
}
