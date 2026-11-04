import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { emptySnapshot, validateSnapshot } from '../src/lib/youtube-import.js';

const root=resolve(import.meta.dirname,'..');
async function main() {
  const preview=process.argv.includes('--preview'),snapshotPath=resolve(root,'.local/youtube-snapshot.json'),proofPath=resolve(root,'.local/publication-context.json');
  if(preview){let raw;try{raw=await readFile(snapshotPath,'utf8');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const snapshot=raw?validateSnapshot(JSON.parse(raw),'UCCxO94rfXnMpYf7DH_sd6Bw'):emptySnapshot('UCCxO94rfXnMpYf7DH_sd6Bw');
    if(snapshot.initialized&&snapshot.expiresAt&&Date.parse(snapshot.expiresAt)<=Date.now())throw new Error('Expired snapshot requires youtube:sync --maintenance before preview');
    await mkdir(resolve(root,'.local'),{recursive:true});await writeFile(proofPath,JSON.stringify({mode:'preview',initialized:snapshot.initialized,contentHash:snapshot.contentHash},null,2));console.log('Preview snapshot hydrated.');return;
  }
  const origin=process.env.YOUTUBE_PUBLICATION_ORIGIN,feedUrl=process.env.YOUTUBE_FEED_URL;
  if(!origin||!feedUrl)throw new Error('Publication hydration requires orchestrator-provided YOUTUBE_PUBLICATION_ORIGIN and authenticated YOUTUBE_FEED_URL');
  const base=new URL(origin);const feed=new URL(feedUrl);if(base.origin!==feed.origin||feed.pathname!=='/youtube-feed.json')throw new Error('Publication feed must be /youtube-feed.json on the configured Site origin');
  const response=await fetch(feed,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error(`Published feed read failed (HTTP ${response.status})`);
  const published=validateSnapshot(await response.json(),'UCCxO94rfXnMpYf7DH_sd6Bw');let candidate;
  try{candidate=validateSnapshot(JSON.parse(await readFile(snapshotPath,'utf8')),'UCCxO94rfXnMpYf7DH_sd6Bw');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const candidateCurrent=candidate?.initialized&&!!candidate.expiresAt&&Date.parse(candidate.expiresAt)>Date.now();
  const snapshot=candidateCurrent&&(!published.validatedAt||Date.parse(candidate!.validatedAt!)>Date.parse(published.validatedAt??''))?candidate!:published;
  await mkdir(resolve(root,'.local'),{recursive:true});await writeFile(snapshotPath,JSON.stringify(snapshot,null,2));await writeFile(proofPath,JSON.stringify({mode:'publication',origin:base.origin,baselineInitialized:published.initialized,baselineContentHash:published.contentHash,candidateContentHash:snapshot.contentHash,initialized:snapshot.initialized,contentHash:snapshot.contentHash,validatedAt:snapshot.validatedAt},null,2));console.log('Published snapshot hydrated and verified.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
