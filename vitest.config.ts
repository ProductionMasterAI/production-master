import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      // v8 provider — no source instrumentation, matches the Node 22 runtime.
      provider: 'v8',
      // Vitest 4 counts every file matched by `include` below in the
      // denominator, not just imported ones (the old `all: true` option was
      // removed and is now the behaviour), so an untested new file lowers
      // coverage and trips the gate.
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
      // so the gate is meaningful without a backfill. When coverage climbs,
      // raise these — never lower them for a code or test change.
      //
      // Re-baselined once for the Vitest 3 -> 4 upgrade, whose V8 provider
      // switched to AST-aware remapping and so counts statements and
      // functions differently for the same code and tests (functions went
      // from 340/395 to 364/454). Baseline under Vitest 4: stmts 78.81%,
      // branches 69.32%, functions 80.17%, lines 81.42%. Only the functions
      // floor moved (84 -> 77, the same ~3-point margin); the others still
      // hold under the new counter and are unchanged.
      thresholds: {
        statements: 78,
        branches: 68,
        functions: 77,
        lines: 78,
      },
    },
  },
});
