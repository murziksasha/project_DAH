import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertProductionDockerState,
  collectRollbackImages,
  describeAbsentContainers,
  isDockerNotFound,
} from './production-docker-state.mjs';

const mockConfig = {
  projectName: 'project_dah',
  postgresDataVolume: 'project_dah_postgres_data',
  minioDataVolume: 'project_dah_minio_data',
};

test('isDockerNotFound detects Docker missing object messages', () => {
  assert.equal(isDockerNotFound('Error: No such container: project_dah-api-1'), true);
  assert.equal(isDockerNotFound('Error: No such volume: dummy'), true);
  assert.equal(isDockerNotFound('Error: No such image: dummy'), true);
  assert.equal(isDockerNotFound('Connection refused'), false);
});

test('assertProductionDockerState validates volume existence and container labels', () => {
  const inspectMock = (args) => {
    const cmd = args.join(' ');
    if (cmd.includes('volume inspect project_dah_postgres_data')) return 'project_dah_postgres_data';
    if (cmd.includes('volume inspect project_dah_minio_data')) return 'project_dah_minio_data';
    if (cmd.includes('inspect --format {{index .Config.Labels "com.docker.compose.project"}} project_dah-postgres-1')) {
      return 'project_dah';
    }
    if (cmd.includes('inspect --format {{range .Mounts}}')) {
      if (cmd.includes('postgres')) return 'volume:project_dah_postgres_data';
      if (cmd.includes('minio')) return 'volume:project_dah_minio_data';
    }
    if (cmd.includes('inspect --format {{index .Config.Labels "com.docker.compose.project"}} project_dah-minio-1')) {
      return 'project_dah';
    }
    return null;
  };

  const state = assertProductionDockerState(mockConfig, { inspectDocker: inspectMock });
  assert.equal(state.postgres, 'present');
  assert.equal(state.minio, 'present');
});

test('assertProductionDockerState throws when declared volume is missing', () => {
  const inspectMock = () => null;
  assert.throws(
    () => assertProductionDockerState(mockConfig, { inspectDocker: inspectMock }),
    /declared production volume "project_dah_postgres_data" was not found/i,
  );
});

test('assertProductionDockerState reports absent containers cleanly', () => {
  const inspectMock = (args) => {
    const cmd = args.join(' ');
    if (cmd.includes('volume inspect')) {
      return cmd.includes('postgres') ? mockConfig.postgresDataVolume : mockConfig.minioDataVolume;
    }
    return null; // containers absent
  };

  const state = assertProductionDockerState(mockConfig, { inspectDocker: inspectMock });
  assert.equal(state.postgres, 'absent');
  assert.equal(state.minio, 'absent');
  assert.deepEqual(describeAbsentContainers(state), ['postgres', 'minio']);
});

test('collectRollbackImages collects existing images and skips absent containers', () => {
  const inspectMock = (args) => {
    const cmd = args.join(' ');
    if (cmd.includes('project_dah-api-1')) return 'sha256:1111111111111111';
    return null; // web is absent
  };

  const result = collectRollbackImages(
    [
      ['project_dah-api-1', 'miy-dim/api:rollback'],
      ['project_dah-web-1', 'miy-dim/web:rollback'],
    ],
    { inspectDocker: inspectMock },
  );

  assert.equal(result.tag.length, 1);
  assert.equal(result.tag[0].container, 'project_dah-api-1');
  assert.equal(result.tag[0].imageId, 'sha256:1111111111111111');
  assert.deepEqual(result.skipped, ['project_dah-web-1']);
});
