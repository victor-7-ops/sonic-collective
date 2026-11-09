import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readConfiguredRelease} from './release-artifact.mjs';
import {tsImport} from 'tsx/esm/api';

const readJson=async path=>JSON.parse(await readFile(path,'utf8'));

export async function readBuildInputs(root=process.cwd(),env=process.env) {
  const envelope=await readConfiguredRelease(env);
  const release=envelope?(await tsImport('../../src/lib/editorial/releases.ts',import.meta.url)).parseReleaseArtifact(envelope):null;
  let snapshot;
  try { snapshot=await readJson(resolve(root,'.local/youtube-snapshot.json')); }
  catch(error) {
    if(error.code!=='ENOENT') throw error;
    snapshot=await readJson(resolve(root,'src/data/youtube-snapshot.json'));
  }
  const catalog=release?.catalog??{
    artists:await readJson(resolve(root,'src/data/artists.json')),
    performances:await readJson(resolve(root,'src/data/performances.json')),
    clips:await readJson(resolve(root,'src/data/clips.json')),
    series:await readJson(resolve(root,'src/data/series.json')),
    site:await readJson(resolve(root,'src/data/site.json')),
  };
  const youtubeOverrides=release?.youtubeOverrides??await readJson(resolve(root,'src/data/youtube-overrides.json'));
  return {release,catalog,youtubeOverrides,snapshot};
}
