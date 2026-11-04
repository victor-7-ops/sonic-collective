import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeApiLoader, type YouTubeLoaderEnvironment, type YouTubeApi } from '../src/lib/youtube';

class FakePlayer {}
function setup() {
  let api: YouTubeApi | undefined;
  let ready: (() => void) | null | undefined;
  let previousCalls = 0;
  let nextTimer = 0;
  const timers = new Map<number, () => void>();
  const scripts: Array<{ error: () => void; removed: number }> = [];
  const environment: YouTubeLoaderEnvironment = {
    getApi: () => api,
    getReadyCallback: () => ready,
    setReadyCallback: (callback) => { ready = callback; },
    createScript: (error) => { const script = { error, removed: 0 }; scripts.push(script); return { remove: () => { script.removed++; } }; },
    setTimer: (callback) => { const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimer: (id) => { timers.delete(id); },
  };
  const previous = () => { previousCalls++; };
  ready = previous;
  const load = createYouTubeApiLoader(environment, 12_000);
  return { load, scripts, timers, ready: () => ready, setApi: (value?: YouTubeApi) => { api = value; }, previousCalls: () => previousCalls };
}

test('reuses an already-ready API without inserting a script', async () => {
  const fake = setup(); const api = { Player: FakePlayer } as unknown as YouTubeApi;
  fake.setApi(api);
  assert.equal(await fake.load(), api); assert.equal(fake.scripts.length, 0);
});

test('concurrent callers share one script and the existing readiness callback', async () => {
  const fake = setup(); const first = fake.load(); const second = fake.load();
  assert.equal(first, second); assert.equal(fake.scripts.length, 1);
  const api = { Player: FakePlayer } as unknown as YouTubeApi; fake.setApi(api); fake.ready()?.();
  assert.equal(await first, api); assert.equal(fake.previousCalls(), 1); assert.equal(fake.ready()?.name, 'previous');
  assert.equal(fake.scripts[0].removed, 0); assert.equal(fake.timers.size, 0);
});

test('failure removes the script, restores callback, and allows a clean retry', async () => {
  const fake = setup(); const failed = fake.load(); fake.scripts[0].error();
  await assert.rejects(failed, /request failed/);
  assert.equal(fake.scripts[0].removed, 1); assert.equal(fake.ready()?.name, 'previous');
  const retry = fake.load(); assert.equal(fake.scripts.length, 2);
  const api = { Player: FakePlayer } as unknown as YouTubeApi; fake.setApi(api); fake.ready()?.();
  assert.equal(await retry, api);
});

test('timeout resets the cache and reports a bounded loading failure', async () => {
  const fake = setup(); const pending = fake.load(); const timeout = [...fake.timers.values()][0];
  assert.ok(timeout); timeout(); await assert.rejects(pending, /12000ms/);
  assert.equal(fake.scripts[0].removed, 1); assert.equal(fake.timers.size, 0);
  const retry = fake.load(); assert.equal(fake.scripts.length, 2); fake.scripts[1].error();
  await assert.rejects(retry, /request failed/);
});
