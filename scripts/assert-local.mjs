import { assertLocalDevelopmentHost } from './product-env.mjs';

try {
  assertLocalDevelopmentHost();
} catch (error) {
  console.error(`\nCommand refused: ${error.message}`);
  process.exit(1);
}
