import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      // v8 provider — no source instrumentation, matches the Node 22 runtime.
      provider: 'v8',
      // Count every source file in the denominator, not just imported ones, so
      // an untested new file lowers coverage and trips the gate.
      all: true,
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      // Only first-party workspace source counts toward the gate.
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        // Test-only helpers and fakes.
        '**/__fixtures__/**',
        // Package entry barrels — pure re-exports, no logic to cover.
        'packages/*/src/index.ts',
        // Type/interface-only modules — no executable statements.
        '**/types.ts',
        '**/host/host-adapter.ts',
        '**/*.d.ts',
      ],
      // Rise-only ratchet: floors sit a few points below the measured baseline
      // (stmts/lines 80.97%, branches 71.52%, functions 87.54% as of this
      // commit) so the gate is meaningful without a backfill. When coverage
      // climbs, raise these — never lower them.
      thresholds: {
        statements: 78,
        branches: 68,
        functions: 84,
        lines: 78,
      },
    },
  },
});
