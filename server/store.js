import { createHash } from 'node:crypto';
export const ROOM_TTL = 24 * 60 * 60;
const CAS = `local current = redis.call('GET', KEYS[1]); if not current then return 0 end; if cjson.decode(current).version ~= tonumber(ARGV[1]) then return 0 end; redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1`;
const RATE = `local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return n`;
export class RedisStore {
  constructor(url, token, request = fetch) { this.url = url; this.token = token; this.request = request; }
  async command(...args) {
    const response = await this.request(this.url, {method:'POST', headers:{Authorization:`Bearer ${this.token}`, 'Content-Type':'application/json'}, body:JSON.stringify(args), signal:AbortSignal.timeout(8000)});
    const data = await response.json();
    if (!response.ok || data.error) throw new Error('Room storage is temporarily unavailable.');
    return data.result;
  }
  async get(code) { const raw = await this.command('GET', 'fourway:room:'+code); return raw ? JSON.parse(raw) : null; }
  async create(room) { return (await this.command('SET', 'fourway:room:'+room.code, JSON.stringify(room), 'EX', ROOM_TTL, 'NX')) === 'OK'; }
  async commit(room, version) { return (await this.command('EVAL', CAS, 1, 'fourway:room:'+room.code, version, JSON.stringify(room), ROOM_TTL)) === 1; }
  async rate(identity, limit, seconds) {
    const key=createHash('sha256').update(identity).digest('hex');
    return await this.command('EVAL', RATE, 1, 'fourway:rate:'+key, seconds) <= limit;
  }
}
// Only used by the single-process local development server and tests.
export class MemoryStore {
  constructor(now = Date.now) { this.rooms=new Map(); this.rates=new Map(); this.now=now; }
  async get(code) { const r=this.rooms.get(code); if(!r || r.expires <= this.now()){this.rooms.delete(code);return null;} return structuredClone(r.room); }
  async create(room) { const r=this.rooms.get(room.code);if(r && r.expires>this.now())return false;this.rooms.set(room.code,{room:structuredClone(room),expires:this.now()+ROOM_TTL*1000});return true; }
  async commit(room, version) { const r=this.rooms.get(room.code);if(!r || r.expires<=this.now() || r.room.version!==version)return false;this.rooms.set(room.code,{room:structuredClone(room),expires:this.now()+ROOM_TTL*1000});return true; }
  async rate(identity, limit, seconds) {
    const now=this.now();let r=this.rates.get(identity);if(!r||r.expires<=now)this.rates.set(identity,r={n:0,expires:now+seconds*1000});
    if(this.rates.size>10000)for(const [k,v] of this.rates)if(v.expires<=now)this.rates.delete(k);
    return ++r.n<=limit;
  }
}
export function productionStore(env = process.env) {
  const url=env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL, token=env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if(!url || !token) return null;
  return new RedisStore(url,token);
}
