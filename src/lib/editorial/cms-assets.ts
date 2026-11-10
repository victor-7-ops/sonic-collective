import type {Catalog} from '../schemas';

// Media-library images are referenced from content as `/media/cms/<asset-uuid>`.
// The release build copies each ready, validated derivative to `/media/cms/<asset-uuid>.webp`.
const basePattern=/^\/media\/cms\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

export const cmsAssetBase=(id:string)=>`/media/cms/${id}`;
export const cmsAssetFile=(id:string)=>`/media/cms/${id}.webp`;

export function cmsAssetId(path:string):string|null {
  return basePattern.exec(path)?.[1]??null;
}

export function cmsAssetIds(catalog:Pick<Catalog,'artists'|'performances'>):string[] {
  const paths=[...catalog.artists.map(artist=>artist.portrait),...catalog.performances.map(performance=>performance.thumbnail)];
  return [...new Set(paths.flatMap(path=>{const id=path?cmsAssetId(path):null;return id?[id]:[];}))].sort();
}

export type CmsAssetDimensions={id:string;width:number;height:number};

export function cmsManifestEntry({id,width,height}:CmsAssetDimensions) {
  return {fit:'contain' as const,aspectRatio:width/height,variants:[{src:cmsAssetFile(id),width,height,format:'webp' as const}]};
}

/** Manifest entries and file paths for the given assets, merged over the packaged manifest. */
export function withCmsAssets<T extends Record<string,unknown>>(manifest:T,assets:CmsAssetDimensions[]) {
  const merged:Record<string,unknown>={...manifest};
  for(const asset of assets) merged[cmsAssetBase(asset.id)]=cmsManifestEntry(asset);
  return merged;
}
