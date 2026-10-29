import { Injectable } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import { SharedStateService } from "./shared-state.service";

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly state: SharedStateService) {}
  async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string) {
    const result = await this.state.eval(`
      local now = redis.call('TIME'); local ms = now[1]*1000 + math.floor(now[2]/1000)
      local blocked = tonumber(redis.call('HGET', KEYS[1], 'blocked') or '0')
      local expires = tonumber(redis.call('HGET', KEYS[1], 'expires') or '0')
      local hits = tonumber(redis.call('HGET', KEYS[1], 'hits') or '0')
      if blocked > ms then return {hits, math.max(0, expires-ms), 1, blocked-ms} end
      if blocked > 0 or expires <= ms then hits=0; expires=ms+tonumber(ARGV[1]) end
      hits=hits+1; blocked=0
      if hits > tonumber(ARGV[2]) then blocked=ms+tonumber(ARGV[3]) end
      redis.call('HSET', KEYS[1], 'hits',hits,'expires',expires,'blocked',blocked)
      redis.call('PEXPIRE', KEYS[1], math.max(expires,blocked)-ms)
      return {hits, expires-ms, blocked > ms and 1 or 0, math.max(0,blocked-ms)}
    `, this.state.key(`throttle:${throttlerName}`, key), ttl, limit, blockDuration) as number[];
    return { totalHits: result[0], timeToExpire: Math.ceil(result[1]/1000), isBlocked: result[2] === 1, timeToBlockExpire: Math.ceil(result[3]/1000) };
  }
}
