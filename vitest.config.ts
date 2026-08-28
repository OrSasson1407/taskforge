import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // e2e/integration tests all hit the same Firestore emulator instance and
    // mutate shared collections (jobs, workers). Running test *files* in
    // parallel lets one file's setup/cleanup race another file's assertions
    // (e.g. phase4 clearing `workers` mid-flight while phase5 depends on a
    // worker doc it just wrote). Force sequential file execution until/unless
    // each e2e file is given its own isolated Firestore namespace.
    fileParallelism: false,
    env: {
      FIRESTORE_EMULATOR_HOST: 'localhost:8082',
      GCLOUD_PROJECT: 'taskforge-emulator'
    }
  }
});
