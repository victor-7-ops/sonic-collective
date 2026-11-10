import fs from 'node:fs';
import path from 'node:path';
import {readBuildInputs} from './lib/build-inputs.mjs';
import {catalogSchema} from '../src/lib/schemas';
import {parseReleaseArtifact} from '../src/lib/editorial/releases';
import {validateCatalog} from '../src/lib/validate-catalog';
import manifest from '../src/data/media-manifest.json';
import {withCmsAssets} from '../src/lib/editorial/cms-assets';

const root=process.cwd();
const inputs=await readBuildInputs(root);
const catalog=inputs.release?parseReleaseArtifact(inputs.release).catalog:catalogSchema.parse(inputs.catalog);
// Release images materialized by `npm run cms:materialize`; empty for repository-content builds.
const cmsDir=path.resolve(root,'src/data/cms-media');
const cmsAssets=fs.existsSync(cmsDir)?fs.readdirSync(cmsDir).filter(name=>name.endsWith('.json')).map(name=>JSON.parse(fs.readFileSync(path.join(cmsDir,name),'utf8'))):[];
const result=validateCatalog(catalog,withCmsAssets(manifest,cmsAssets),publicPath=>{
  if(!publicPath.startsWith('/')||publicPath.includes('..')||publicPath.includes('\\')) return false;
  const target=path.resolve(root,'public',`.${publicPath}`);
  return target.startsWith(path.resolve(root,'public')+path.sep)&&fs.existsSync(target);
});
if(!result.ok) { console.error(result.errors.join('\n')); process.exitCode=1; }
else console.log(`Content valid: ${result.catalog!.artists.length} artists, ${result.catalog!.performances.length} performances, ${result.catalog!.clips.length} clips.`);
