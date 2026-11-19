import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertProductEnvironment,
  productChildEnvironment,
  productComposeArgs,
  productImageRefs,
  projectRoot,
  rollbackImageRefs,
} from './product-env.mjs';
import {
  assertProductionDockerState,
  collectRollbackImages,
  describeAbsentContainers,
} from './production-docker-state.mjs';
import { assertCleanReleaseCheckout } from './production-git-state.mjs';

export const buildProductionImages = () => {
  let config;
  let gitSha;
  try {
    config = assertProductEnvironment();
    gitSha = assertCleanReleaseCheckout();
    const dockerState = assertProductionDockerState(config);
    const absent = describeAbsentContainers(dockerState);
    if (absent.length > 0) {
      console.log(`Containers absent (${absent.join(', ')}); will be created on the existing volumes.`);
    }
  } catch (error) {
    console.error(`\nBuild aborted: ${error.message}`);
    process.exit(1);
  }

  const environment = productChildEnvironment({
    GIT_SHA: gitSha,
    DOCKER_BUILDKIT: '1',
    COMPOSE_DOCKER_CLI_BUILD: '1',
  });

  const runDocker = (args, capture = false) => {
    const result = spawnSync('docker', args, {
      cwd: projectRoot,
      env: environment,
      encoding: capture ? 'utf8' : undefined,
      stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    if (result.error || result.status !== 0) {
      console.error(result.error?.message ?? 'Docker command failed.');
      process.exit(result.status || 1);
    }
    return capture ? result.stdout.trim() : '';
  };

  runDocker([...productComposeArgs, 'config', '-q']);

  // Collect and save running container images as rollback tags
  const apiContainer = `${config.projectName}-api-1`;
  const webContainer = `${config.projectName}-web-1`;
  const rollback = collectRollbackImages([
    [apiContainer, rollbackImageRefs[0]],
    [webContainer, rollbackImageRefs[1]],
  ]);

  for (const { imageId, rollbackImage } of rollback.tag) {
    runDocker(['image', 'tag', imageId, rollbackImage]);
  }
  if (rollback.skipped.length > 0) {
    console.log(
      `No existing running container for ${rollback.skipped.join(', ')}; rollback tags left unchanged.`,
    );
  }

  console.log(
    `${rollback.tag.length > 0 ? 'Saved running images for rollback; b' : 'B'}uilding production images for ${gitSha}...`,
  );
  runDocker([...productComposeArgs, 'build', 'api', 'web']);

  for (const imageRef of productImageRefs(gitSha)) {
    runDocker(['image', 'inspect', imageRef, '--format', '{{.Id}}']);
  }
  console.log(`Production images built successfully for ${gitSha}. Running containers were not touched.`);
  return gitSha;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildProductionImages();
}
