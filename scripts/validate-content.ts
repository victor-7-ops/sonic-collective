import fs from 'node:fs';
import path from 'node:path';
import { validateCatalog } from '../src/lib/validate-catalog';

const root=process.cwd();
const read=(name:string)=>JSON.parse(fs.readFileSync(path.join(root,'src/data',`${name}.json`),'utf8'));
const result=validateCatalog({artists:read('artists'),performances:read('performances'),clips:read('clips'),series:read('series'),site:read('site')},read('media-manifest'),(publicPath)=>{
  if(!publicPath.startsWith('/')||publicPath.includes('..')||publicPath.includes('\\'))return false;
  const target=path.resolve(root,'public',`.${publicPath}`);
  return target.startsWith(path.resolve(root,'public')+path.sep)&&fs.existsSync(target);
});
if(!result.ok){console.error(result.errors.join('\n'));process.exitCode=1;}else console.log(`Content valid: ${result.catalog!.artists.length} artists, ${result.catalog!.performances.length} performances, ${result.catalog!.clips.length} clips.`);
