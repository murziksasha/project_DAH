import { spawnSync } from 'node:child_process';
import { projectRoot } from './product-env.mjs';

const notFoundPattern = /no such (object|container|volume|image)/i;

export const isDockerNotFound = (stderr) => notFoundPattern.test(String(stderr ?? ''));

export const inspectDockerObject = (args, { run = spawnSync } = {}) => {
  const result = run('docker', args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new Error(`Docker could not start (docker ${args.join(' ')}): ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    if (isDockerNotFound(stderr)) return null;
    throw new Error(
      `Docker inspection failed (docker ${args.join(' ')}): ${stderr || `exit code ${result.status}`}`,
    );
  }
  return String(result.stdout ?? '').trim();
};

const projectFormat = '{{index .Config.Labels "com.docker.compose.project"}}';
const mountFormat = (destination) =>
  `{{range .Mounts}}{{if eq .Destination "${destination}"}}{{.Type}}:{{.Name}}{{end}}{{end}}`;

const checkContainer = (inspectDocker, config, { container, label, destination, volume, kind }) => {
  const project = inspectDocker(['inspect', '--format', projectFormat, container]);
  if (project === null) return 'absent';
  if (project !== config.projectName) {
    throw new Error(`The ${label} container belongs to a different Compose project (${project} vs ${config.projectName}).`);
  }
  const mount = inspectDocker(['inspect', '--format', mountFormat(destination), container]);
  if (mount === null) return 'absent';
  if (mount !== `volume:${volume}`) {
    throw new Error(`The ${label} container does not use the declared existing ${kind} volume (${mount} vs volume:${volume}).`);
  }
  return 'present';
};

export const assertProductionDockerState = (
  config,
  { inspectDocker = inspectDockerObject } = {},
) => {
  for (const volume of [config.postgresDataVolume, config.minioDataVolume]) {
    const inspected = inspectDocker(['volume', 'inspect', volume, '--format', '{{.Name}}']);
    if (inspected !== volume) {
      throw new Error(`The declared production volume "${volume}" was not found in Docker.`);
    }
  }

  const postgresContainer = `${config.projectName}-postgres-1`;
  const minioContainer = `${config.projectName}-minio-1`;

  const postgres = checkContainer(inspectDocker, config, {
    container: postgresContainer,
    label: 'PostgreSQL',
    destination: '/var/lib/postgresql/data',
    volume: config.postgresDataVolume,
    kind: 'postgres',
  });

  const minio = checkContainer(inspectDocker, config, {
    container: minioContainer,
    label: 'MinIO',
    destination: '/data',
    volume: config.minioDataVolume,
    kind: 'minio',
  });

  return { postgres, minio };
};

export const describeAbsentContainers = (state) =>
  Object.entries(state)
    .filter(([, status]) => status === 'absent')
    .map(([name]) => name);

export const collectRollbackImages = (pairs, { inspectDocker = inspectDockerObject } = {}) => {
  const tag = [];
  const skipped = [];
  for (const [container, rollbackImage] of pairs) {
    const imageId = inspectDocker(['inspect', '--format', '{{.Image}}', container]);
    if (imageId === null) {
      skipped.push(container);
      continue;
    }
    tag.push({ container, imageId, rollbackImage });
  }
  return { tag, skipped };
};

export const assertImagesPresent = (imageRefs, { inspectDocker = inspectDockerObject } = {}) => {
  for (const imageRef of imageRefs) {
    const imageId = inspectDocker(['image', 'inspect', imageRef, '--format', '{{.Id}}']);
    if (!imageId) {
      throw new Error(`Expected image "${imageRef}" is not found in Docker. Run build first.`);
    }
  }
};
