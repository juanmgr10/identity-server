import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionIpAndUserAgent1789070096883 implements MigrationInterface {
  name = 'AddSessionIpAndUserAgent1789070096883';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD "ip" character varying(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD "user_agent" character varying(512)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "user_agent"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "ip"`);
  }
}
