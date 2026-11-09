import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import manifest from '../../data/media-manifest.json';
import clipsSeed from '../../data/clips.json';
import siteSeed from '../../data/site.json';
import youtubeSnapshot from '../../data/youtube-snapshot.json';
import {z} from 'zod';
import {catalogSchema, type Catalog} from '../schemas';
import {youtubeOverridesSchema,type YoutubeOverride} from '../merge-catalog';
import {validateSnapshot} from '../youtube-import';
import {validateCatalog} from '../validate-catalog';
import {parseEditorialPayload, editorialKindSchema, type EditorialKind} from './content';

export type ApprovedReleaseRecord={kind:EditorialKind;stableId:string;revisionId:string;payload:unknown};
export type ReleaseArtifact={schemaVersion:1;releaseId:string;revisionMap:{kind:EditorialKind;stableId:string;revisionId:string}[];catalog:Catalog;youtubeOverrides:YoutubeOverride[];contentHash:string};
const revisionMapEntrySchema=z.object({kind:editorialKindSchema,stableId:z.string().min(1),revisionId:z.uuid()}).strict();
const releaseEnvelopeSchema=z.object({schemaVersion:z.literal(1),releaseId:z.uuid(),revisionMap:z.array(revisionMapEntrySchema),catalog:catalogSchema,youtubeOverrides:youtubeOverridesSchema,contentHash:z.string().regex(/^[a-f\d]{64}$/)}).strict();

function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if(value&&typeof value==='object') {
    const object=value as Record<string,unknown>;
    return `{${Object.keys(object).sort(compareCodepoint).map(key=>`${JSON.stringify(key)}:${canonical(object[key])}`).join(',')}}`;
  }
  if(value===null||typeof value==='string'||typeof value==='boolean') return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value)) return JSON.stringify(value);
  throw new Error('Release snapshot contains a non-JSON value.');
}

function compareCodepoint(a:string,b:string):number { return a<b?-1:a>b?1:0; }

export function buildReleaseArtifact(releaseId:string,input:unknown):ReleaseArtifact {
  if(!/^[a-f\d-]{36}$/i.test(releaseId)) throw new Error('Invalid release ID.');
  if(!Array.isArray(input)) throw new Error('Release snapshot must be a record array.');
  const records=(input as ApprovedReleaseRecord[]).map(record=>{
    const kind=editorialKindSchema.parse(record.kind);
    if(!/^[a-f\d-]{36}$/i.test(record.revisionId)) throw new Error(`Invalid revision ID for ${kind}/${record.stableId}.`);
    return {kind,stableId:record.stableId,revisionId:record.revisionId,payload:parseEditorialPayload(kind,record.stableId,record.payload)};
  }).sort((a,b)=>compareCodepoint(a.kind,b.kind)||compareCodepoint(a.stableId,b.stableId));
  const keys=new Set<string>();
  for(const record of records) {
    const key=`${record.kind}:${record.stableId}`;
    if(keys.has(key)) throw new Error(`Duplicate approved content: ${key}.`);
    keys.add(key);
  }
  const ofKind=(kind:EditorialKind)=>records.filter(record=>record.kind===kind).map(record=>record.payload);
  const sites=records.filter(record=>record.kind==='site');
  if(sites.length!==1||sites[0]!.stableId!=='site') throw new Error('Release requires exactly one approved site settings record.');
  const parsed=catalogSchema.parse({artists:ofKind('artist'),performances:ofKind('performance'),clips:ofKind('clip'),series:ofKind('series'),site:sites[0]!.payload});
  const overrides=youtubeOverridesSchema.parse(ofKind('youtube-review'));
  const artistIds=new Set(parsed.artists.map(artist=>artist.id));
  const performanceVideoIds=new Set(parsed.performances.filter(performance=>performance.approvedForSite).map(performance=>performance.youtubeId));
  const importedVideoIds=new Set(validateSnapshot(youtubeSnapshot,'UCCxO94rfXnMpYf7DH_sd6Bw').videos.map(video=>video.youtubeId));
  const overrideByVideo=new Map(overrides.map(override=>[override.youtubeId,override]));
  for(const override of overrides) {
    for(const artistId of override.artistIds??[]) if(!artistIds.has(artistId)) throw new Error(`YouTube review references missing artist ${artistId}.`);
    if(override.fullYoutubeId) {
      const target=overrideByVideo.get(override.fullYoutubeId);
      if(target?.format!=='full') throw new Error(`YouTube review references a target without an approved full format: ${override.fullYoutubeId}.`);
      if(!performanceVideoIds.has(override.fullYoutubeId)&&!importedVideoIds.has(override.fullYoutubeId)) throw new Error(`YouTube review references missing full video ${override.fullYoutubeId}.`);
      if(override.format!=='short'||override.fullYoutubeId===override.youtubeId) throw new Error('Invalid YouTube short-to-full mapping.');
    }
  }
  const mediaPaths=new Set<string>([
    ...Object.values(manifest).flatMap(entry=>entry.variants.map(variant=>variant.src)),
    ...clipsSeed.flatMap(clip=>[clip.src,clip.poster]),
    siteSeed.hero.portraitPoster,siteSeed.hero.portraitLoopSrc,
  ]);
  const validation=validateCatalog(parsed,manifest,path=>mediaPaths.has(path),true);
  if(!validation.ok) throw new Error(`Invalid release catalog: ${validation.errors.join('; ')}`);
  const catalog=validation.catalog!;
  const revisionMap=records.map(({kind,stableId,revisionId})=>({kind,stableId,revisionId}));
  const body={schemaVersion:1 as const,releaseId,revisionMap,catalog,youtubeOverrides:overrides};
  const contentHash=createHash('sha256').update(canonical(body)).digest('hex');
  return {...body,contentHash};
}

export function parseReleaseArtifact(input:unknown):ReleaseArtifact {
  const envelope=releaseEnvelopeSchema.parse(input);
  const records:ApprovedReleaseRecord[]=envelope.revisionMap.map(({kind,stableId,revisionId})=>{
    let payload:unknown;
    if(kind==='artist') payload=envelope.catalog.artists.find(record=>record.id===stableId);
    else if(kind==='performance') payload=envelope.catalog.performances.find(record=>record.id===stableId);
    else if(kind==='clip') payload=envelope.catalog.clips.find(record=>record.id===stableId);
    else if(kind==='series') payload=envelope.catalog.series.find(record=>record.id===stableId);
    else if(kind==='site') payload=stableId==='site'?envelope.catalog.site:undefined;
    else payload=envelope.youtubeOverrides.find(record=>record.youtubeId===stableId);
    if(!payload) throw new Error(`Release revision map does not resolve ${kind}/${stableId}.`);
    return {kind,stableId,revisionId,payload};
  });
  const rebuilt=buildReleaseArtifact(envelope.releaseId,records);
  if(canonical(rebuilt)!==canonical(envelope)) throw new Error('Release artifact integrity check failed.');
  return rebuilt;
}

let configuredArtifact:Promise<ReleaseArtifact|null>|undefined;
export function getConfiguredReleaseArtifact():Promise<ReleaseArtifact|null> {
  configuredArtifact??=(async()=>{
    const file=process.env.CMS_RELEASE_FILE;
    if(file===undefined) return null;
    if(!file.trim()||!isAbsolute(file)) throw new Error('CMS_RELEASE_FILE must name an absolute artifact file.');
    return parseReleaseArtifact(JSON.parse(await readFile(file,'utf8')));
  })();
  return configuredArtifact;
}

