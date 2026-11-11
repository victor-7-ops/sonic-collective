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
  const paths=[
    ...catalog.artists.flatMap(artist=>[artist.portrait,...(artist.gallery??[]).map(item=>item.image)]),
    ...catalog.performances.flatMap(performance=>[performance.thumbnail,...(performance.gallery??[]).map(item=>item.image)]),
  ];
  return [...new Set(paths.flatMap(path=>{const id=path?cmsAssetId(path):null;return id?[id]:[];}))].sort();
}

/** Small copy made at build time so grids do not load full-size photos. */
export const cmsThumbWidth=800;
export const cmsThumbFile=(id:string)=>`/media/cms/${id}-${cmsThumbWidth}.webp`;

export type CmsAssetDimensions={id:string;width:number;height:number;thumbWidth?:number;thumbHeight?:number};

export function cmsManifestEntry({id,width,height,thumbWidth,thumbHeight}:CmsAssetDimensions) {
  const full={src:cmsAssetFile(id),width,height,format:'webp' as const};
  const variants=thumbWidth&&thumbHeight&&thumbWidth<width?[{src:cmsThumbFile(id),width:thumbWidth,height:thumbHeight,format:'webp' as const},full]:[full];
  return {fit:'contain' as const,aspectRatio:width/height,variants};
}

/** Manifest entries and file paths for the given assets, merged over the packaged manifest. */
export function withCmsAssets<T extends Record<string,unknown>>(manifest:T,assets:CmsAssetDimensions[]) {
  const merged:Record<string,unknown>={...manifest};
  for(const asset of assets) merged[cmsAssetBase(asset.id)]=cmsManifestEntry(asset);
  return merged;
}
