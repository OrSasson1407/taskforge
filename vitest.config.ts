import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    env: {
      FIRESTORE_EMULATOR_HOST: 'localhost:8085',
      GCLOUD_PROJECT: 'taskforge-emulator'
    }
  }
});
