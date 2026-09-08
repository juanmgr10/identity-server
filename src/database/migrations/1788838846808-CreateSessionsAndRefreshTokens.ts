import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessionsAndRefreshTokens1788838846808 implements MigrationInterface {
  name = 'CreateSessionsAndRefreshTokens1788838846808';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "user_id" uuid NOT NULL, "org_id" uuid NOT NULL, "ip_hash" character varying(64) NOT NULL, "user_agent_hash" character varying(64) NOT NULL, "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "revoked_reason" character varying(64), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_085d540d9f418cfbdc7bd55bb1" ON "sessions"  ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_732754bd6729b50099b4491fca" ON "sessions"  ("org_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."refresh_tokens_status_enum" AS ENUM('active', 'rotated', 'revoked')`,
    );
    await queryRunner.query(
      `CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "session_id" uuid NOT NULL, "token_hash" character varying(64) NOT NULL, "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "rotated_at" TIMESTAMP WITH TIME ZONE, "replaced_by_token_id" uuid, "status" "public"."refresh_tokens_status_enum" NOT NULL DEFAULT 'active', "revoked_reason" character varying(64), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3bf308fa93da3966f9e76fcfba" ON "refresh_tokens"  ("session_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens"  ("token_hash") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3bf308fa93da3966f9e76fcfba"`,
    );
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TYPE "public"."refresh_tokens_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_732754bd6729b50099b4491fca"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_085d540d9f418cfbdc7bd55bb1"`,
    );
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
