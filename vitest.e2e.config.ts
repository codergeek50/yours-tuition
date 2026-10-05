import { defineConfig } from 'vitest/config';

// Real-network end-to-end checks against a throwaway private GitHub repo. Run with: npm run test:e2e
export default defineConfig({
  test: { environment: 'node', fileParallelism: false, // the files share one test repo, so run them one after another
     include: ['e2e/**/*.e2e.test.ts'], testTimeout: 60_000, hookTimeout: 60_000 },
});
