import { z } from 'zod';
import { validateSnapshot, type ImportedVideo, type YoutubeSnapshot } from './youtube-import.js';

export const youtubeOverridesSchema = z.array(z.object({
  youtubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  approved: z.boolean().optional(),
  excluded: z.boolean().optional(),
  seriesId: z.enum(['sessions','covers']).nullable().optional(),
  thumbnailUrl: z.url().optional(),
  embeddable: z.boolean().optional(),
  fullYoutubeId: z.string().regex(/^[A-Za-z0-9_-]{11}$/).optional(),
  format: z.enum(['full','short']).optional(),
  artistIds: z.array(z.string().min(1)).optional(),
}));
export type YoutubeOverride = z.infer<typeof youtubeOverridesSchema>[number];
export function mergeCatalog(authored: { youtubeId:string; id:string; approvedForSite:boolean; seriesId:'sessions'|'covers' }[], snapshot:YoutubeSnapshot, overrides:YoutubeOverride[]) {
  validateSnapshot(snapshot);
  const authoredById = new Map(authored.map((record)=>[record.youtubeId,record]));
  const overrideById = new Map(overrides.map((item)=>[item.youtubeId,item]));
  const active = snapshot.initialized && !snapshot.purged && !!snapshot.expiresAt && Date.parse(snapshot.expiresAt)>Date.now();
  const incoming = new Map(snapshot.videos.map((video)=>[video.youtubeId,video]));
  const videos = snapshot.videos.flatMap((video):ImportedVideo[]=> {
    const curated=authoredById.get(video.youtubeId),override=overrideById.get(video.youtubeId);
    if (override?.excluded || (curated && !curated.approvedForSite && !override?.approved)) return [];
    if (!active) return [];
    const seriesId = override?.seriesId === undefined ? video.seriesId : override.seriesId;
    return [{...video,seriesId:curated?.approvedForSite?curated.seriesId:seriesId,thumbnailUrl:override?.thumbnailUrl ?? video.thumbnailUrl,embeddable:video.embeddable&&override?.embeddable!==false}];
  });
  const availabilityByYoutubeId = Object.fromEntries(authored.map((record)=>[record.youtubeId,
    overrideById.get(record.youtubeId)?.excluded?'unavailable':
      !record.approvedForSite&&!overrideById.get(record.youtubeId)?.approved?'unverified':
      active&&!incoming.has(record.youtubeId)?'unavailable':
      overrideById.get(record.youtubeId)?.embeddable===false?'external-only':
      !active?'unverified':incoming.get(record.youtubeId)!.embeddable?'available':'external-only']));
  return { videos, availabilityByYoutubeId };
}
