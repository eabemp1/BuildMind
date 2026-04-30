/**
 * __tests__/setup.ts
 * Global test setup — clears env vars that should not leak between tests.
 */

import { beforeEach } from "vitest";

beforeEach(() => {
  // Reset any env vars individual tests might set
  delete process.env.PAYSTACK_SECRET_KEY;
});
