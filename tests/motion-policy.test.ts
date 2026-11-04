import test from 'node:test';
import assert from 'node:assert/strict';
import { readMotionPause, shouldAutoPlayDecorativeMedia, writeMotionPause } from '../src/lib/motion-policy';

const eligible = { reducedMotion:false, saveData:false, userPaused:false, inViewport:true, documentVisible:true };
test('decorative autoplay requires every permission and visibility condition', () => {
  assert.equal(shouldAutoPlayDecorativeMedia(eligible), true);
  for (const key of Object.keys(eligible) as (keyof typeof eligible)[]) {
    assert.equal(shouldAutoPlayDecorativeMedia({ ...eligible, [key]: key === 'inViewport' || key === 'documentVisible' ? false : true }), false, key);
  }
});

test('motion preference storage persists a session choice', () => {
  const values = new Map<string,string>();
  const store = { getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>{values.set(key,value);} };
  assert.equal(readMotionPause(()=>store), false);
  assert.equal(writeMotionPause(()=>store,true), true);
  assert.equal(readMotionPause(()=>store), true);
});

test('denied session storage safely falls back without throwing', () => {
  const denied = () => { throw new Error('Storage denied'); };
  assert.equal(readMotionPause(denied), false);
  assert.equal(writeMotionPause(denied,true), false);
});
