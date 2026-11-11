import {z} from 'zod';

// Written into every production build as /release.json so the admin can tell which content is really live.
export const releaseMarkerSchema=z.object({
  schemaVersion:z.literal(1),
  source:z.enum(['repository','release']),
  releaseId:z.uuid().nullable(),
  contentHash:z.string().regex(/^[a-f\d]{64}$/).nullable(),
  commit:z.string().regex(/^[a-f\d]{7,40}$/i).nullable(),
  builtAt:z.iso.datetime({offset:true}),
}).strict().refine(marker=>marker.source==='release'?marker.releaseId!==null&&marker.contentHash!==null:marker.releaseId===null&&marker.contentHash===null,'A release marker needs both a release ID and a content hash; a repository marker needs neither.');
export type ReleaseMarker=z.infer<typeof releaseMarkerSchema>;

export function buildReleaseMarker(release:{releaseId:string;contentHash:string}|null,commit:string|undefined,now=new Date()):ReleaseMarker {
  return releaseMarkerSchema.parse({
    schemaVersion:1,source:release?'release':'repository',releaseId:release?.releaseId??null,contentHash:release?.contentHash??null,
    commit:commit&&/^[a-f\d]{7,40}$/i.test(commit)?commit:null,builtAt:now.toISOString(),
  });
}

export type LiveRelease={state:'release';marker:ReleaseMarker}|{state:'repository';marker:ReleaseMarker}|{state:'unknown'};

/** Reads the deployed marker. Any failure is reported as unknown, never as live. */
export async function readLiveRelease(origin:string,fetcher:typeof fetch=fetch):Promise<LiveRelease> {
  try {
    const response=await fetcher(new URL('/release.json',origin),{cache:'no-store',signal:AbortSignal.timeout(4000)});
    if(!response.ok) return {state:'unknown'};
    const marker=releaseMarkerSchema.parse(await response.json());
    return {state:marker.source,marker};
  } catch {return {state:'unknown'};}
}

export function releaseStatus(releaseId:string,contentHash:string|undefined,live:LiveRelease):'live'|'prepared' {
  return live.state==='release'&&live.marker.releaseId===releaseId&&(contentHash===undefined||live.marker.contentHash===contentHash)?'live':'prepared';
}
