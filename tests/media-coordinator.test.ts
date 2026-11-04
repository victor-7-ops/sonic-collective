import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaCoordinator } from '../src/lib/media-coordinator';

test('claim stops the previous owner once and assigns the new owner', () => {
  const media = createMediaCoordinator(); const stopped: string[] = [];
  media.claim('a', () => stopped.push('a'));
  media.claim('b', () => stopped.push('b'));
  assert.deepEqual(stopped, ['a']); assert.equal(media.getActiveOwner(), 'b');
});

test('same-owner updates replace its stop callback without stopping itself', () => {
  const media = createMediaCoordinator(); let old = 0; let latest = 0;
  media.claim('a', () => old++); media.claim('a', () => latest++);
  assert.equal(old, 0); assert.equal(latest, 0);
  media.pauseAll(); assert.equal(old, 0); assert.equal(latest, 1);
});

test('re-entrant claims from a stopping owner cannot be overwritten', () => {
  const media = createMediaCoordinator(); const stopped: string[] = [];
  media.claim('a', () => { stopped.push('a'); media.claim('c', () => stopped.push('c')); });
  media.claim('b', () => stopped.push('b'));
  assert.deepEqual(stopped, ['a']); assert.equal(media.getActiveOwner(), 'c');
});

test('stale releases never clear another owner and pauseAll clears before stopping', () => {
  const media = createMediaCoordinator(); let ownerDuringStop: string | null = 'unset';
  media.claim('a', () => { ownerDuringStop = media.getActiveOwner(); });
  media.claim('b', () => {}); media.release('a');
  assert.equal(media.getActiveOwner(), 'b');
  media.pauseAll(); assert.equal(ownerDuringStop, null); assert.equal(media.getActiveOwner(), null);
});
