import { SharedStateService } from "../src/shared-state/shared-state.service";
import { OneTimeCodeStore } from "../src/common/utils/one-time-code";
import { lockoutDurationMs } from "../src/common/utils/lockout.util";

// Unit-test double only. Cross-process guarantees are tested against Redis in integration tests.
export function sharedStateFake(): SharedStateService {
  const codes = new Map<string, OneTimeCodeStore>();
  const failures = new Map<string, { count: number; until: number }>();
  const seen = new Map<string, number>();
  const store = (scope: string) => {
    if (!codes.has(scope)) codes.set(scope, new OneTimeCodeStore("test", { ttlMs: 600000, maxAttempts: 5, maxEntries: 5000 }));
    return codes.get(scope)!;
  };
  return {
    isLocked: async (key: string) => (failures.get(key)?.until ?? 0) > Date.now(),
    registerFailure: async (key: string) => {
      const count = (failures.get(key)?.count ?? 0) + 1;
      failures.set(key, { count, until: count >= 5 ? Date.now() + lockoutDurationMs(count) : 0 });
    },
    clear: async (scope: string, key: string) => {
      if (scope === "platform-lockout") failures.delete(key);
      else store(scope).consume(key);
    },
    issueCode: async (scope: string, key: string, _ttl: number, cooldown = 0) => {
      if (store(scope).waitMs(key, cooldown)) return null;
      return store(scope).issue(key);
    },
    checkCode: async (scope: string, key: string, code: string) => {
      const result = store(scope).check(key, code);
      if (result === "ok") store(scope).consume(key);
      return result;
    },
    claim: async (scope: string, key: string, ttl: number) => {
      const id = `${scope}:${key}`;
      if ((seen.get(id) ?? 0) > Date.now()) return false;
      seen.set(id, Date.now() + ttl); return true;
    },
  } as unknown as SharedStateService;
}
