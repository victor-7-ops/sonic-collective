import packaged from '../data/media-manifest.json';
import {withCmsAssets,type CmsAssetDimensions} from './editorial/cms-assets';

// Library images are listed here only in builds made from a release (written by `npm run cms:materialize`).
const cmsAssets=Object.values(import.meta.glob<CmsAssetDimensions>('../data/cms-media/*.json',{eager:true,import:'default'}));

/** Every image the public site can render: packaged images plus materialized library images. */
export const siteMediaManifest=withCmsAssets(packaged,cmsAssets) as typeof packaged;
export const hasSiteMedia=(base:string)=>base in siteMediaManifest;
