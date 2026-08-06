process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??=
  'postgresql://dah:dah_secret_change_me@localhost:5432/dah_test';
process.env.JWT_SECRET ??= 'test-jwt-secret-for-e2e-only';
process.env.JWT_ACCESS_EXPIRES ??= '15m';
process.env.JWT_REFRESH_EXPIRES ??= '7d';
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_ACCESS_KEY ??= 'dah_minio';
process.env.S3_SECRET_KEY ??= 'dah_minio_secret_change_me';
process.env.S3_BUCKET ??= 'dah-files';
process.env.S3_REGION ??= 'us-east-1';
// e2e fixtures do not enroll TOTP — keep finance writes available
process.env.REQUIRE_FINANCE_2FA ??= 'false';
process.env.SWAGGER_ENABLED ??= 'false';
process.env.APP_URL ??= 'http://localhost:8080';