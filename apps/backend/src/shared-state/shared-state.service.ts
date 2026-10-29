import { Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { createHash, createHmac } from "crypto";
import { CodeCheck, generateNumericCode, oneTimeCodeSecret } from "../common/utils/one-time-code";

// Scripts execute atomically on Redis. No local fallback: outages must not disable security controls.
@Injectable()
export class SharedStateService implements OnModuleInit, OnModuleDestroy {
  private client?: Redis;
  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.client = new Redis(this.config.getOrThrow<string>("REDIS_URL"), {
      lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1,
      connectTimeout: 3000, commandTimeout: 3000,
    });
    this.client.on("error", () => undefined); // never log connection URLs/credentials
    await this.client.connect();
    await this.client.ping();
  }
  onModuleDestroy() { this.client?.disconnect(); }

  key(scope: string, key: string): string {
    return `marquo:${scope}:${createHash("sha256").update(key).digest("hex")}`;
  }
  async eval(script: string, key: string, ...args: (string | number)[]): Promise<any> {
    try {
      if (!this.client) throw new Error("Redis unavailable");
      return await this.client.eval(script, 1, key, ...args);
    } catch {
      throw new ServiceUnavailableException("Proteção temporariamente indisponível. Tente novamente.");
    }
  }
  async claim(scope: string, value: string, ttlMs: number): Promise<boolean> {
    return (await this.eval(`return redis.call('SET', KEYS[1], '1', 'PX', ARGV[1], 'NX') and 1 or 0`, this.key(scope, value), ttlMs)) === 1;
  }
  async clear(scope: string, value: string): Promise<void> {
    await this.eval(`return redis.call('DEL', KEYS[1])`, this.key(scope, value));
  }
  private digest(scope: string, key: string, code: string) {
    const secret = oneTimeCodeSecret(this.config.getOrThrow<string>("JWT_SECRET"));
    return createHmac("sha256", secret).update(`${scope}\n${key}\n${code}`).digest("hex");
  }
  async issueCode(scope: string, key: string, ttlMs: number, cooldownMs = 0): Promise<string | null> {
    const code = generateNumericCode();
    const issued = await this.eval(`
      local now = redis.call('TIME'); local ms = now[1]*1000 + math.floor(now[2]/1000)
      local last = tonumber(redis.call('HGET', KEYS[1], 'issuedAt') or '0')
      if last + tonumber(ARGV[3]) > ms then return 0 end
      redis.call('HSET', KEYS[1], 'hash', ARGV[1], 'attempts', 0, 'issuedAt', ms)
      redis.call('PEXPIRE', KEYS[1], ARGV[2]); return 1
    `, this.key(scope, key), this.digest(scope, key, code), ttlMs, cooldownMs);
    return issued === 1 ? code : null;
  }
  async checkCode(scope: string, key: string, code: string, consume = true): Promise<CodeCheck> {
    return await this.eval(`
      local hash = redis.call('HGET', KEYS[1], 'hash')
      if not hash then return 'expired' end
      if hash == ARGV[1] then
        if ARGV[2] == '1' then redis.call('DEL', KEYS[1]) end
        return 'ok'
      end
      local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
      if attempts >= 5 then redis.call('DEL', KEYS[1]); return 'locked' end
      return 'invalid'
    `, this.key(scope, key), this.digest(scope, key, code), consume ? 1 : 0) as CodeCheck;
  }
  async isLocked(account: string): Promise<boolean> {
    return (await this.eval(`
      local now = redis.call('TIME'); local ms = now[1]*1000 + math.floor(now[2]/1000)
      return tonumber(redis.call('HGET', KEYS[1], 'until') or '0') > ms and 1 or 0
    `, this.key("platform-lockout", account))) === 1;
  }
  async registerFailure(account: string): Promise<void> {
    await this.eval(`
      local n = redis.call('HINCRBY', KEYS[1], 'failures', 1)
      if n >= 5 then
        local minutes = {1,5,15,30,60}
        local now = redis.call('TIME'); local ms = now[1]*1000 + math.floor(now[2]/1000)
        redis.call('HSET', KEYS[1], 'until', ms + minutes[math.min(n-4,5)]*60000)
      end
      redis.call('PEXPIRE', KEYS[1], 86400000); return n
    `, this.key("platform-lockout", account));
  }
}
