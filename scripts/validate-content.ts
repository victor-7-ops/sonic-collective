import fs from 'node:fs';
import path from 'node:path';
import {readBuildInputs} from './lib/build-inputs.mjs';
import {catalogSchema} from '../src/lib/schemas';
import {parseReleaseArtifact} from '../src/lib/editorial/releases';
import {validateCatalog} from '../src/lib/validate-catalog';
import manifest from '../src/data/media-manifest.json';

const root=process.cwd();
const inputs=await readBuildInputs(root);
const catalog=inputs.release?parseReleaseArtifact(inputs.release).catalog:catalogSchema.parse(inputs.catalog);
const result=validateCatalog(catalog,manifest,publicPath=>{
  if(!publicPath.startsWith('/')||publicPath.includes('..')||publicPath.includes('\\')) return false;
  const target=path.resolve(root,'public',`.${publicPath}`);
  return target.startsWith(path.resolve(root,'public')+path.sep)&&fs.existsSync(target);
});
if(!result.ok) { console.error(result.errors.join('\n')); process.exitCode=1; }
else console.log(`Content valid: ${result.catalog!.artists.length} artists, ${result.catalog!.performances.length} performances, ${result.catalog!.clips.length} clips.`);
