import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 8GB machine constraint: keep the pool single-threaded.
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: true },
    },
  },
});
