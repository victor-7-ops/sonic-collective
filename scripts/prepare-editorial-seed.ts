import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCatalog } from '../src/lib/validate-catalog';
import { parseEditorialPayload, seedSql, type SeedRecord } from '../src/lib/editorial/content';
import { youtubeOverridesSchema } from '../src/lib/merge-catalog';
import { writeAtomic } from './sync-youtube';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--write')) throw new Error('Usage: npm run cms:seed -- [--write]');
const readJson = async (name: string) => JSON.parse(await readFile(resolve('src/data',`${name}.json`),'utf8'));
const [artists,performances,clips,series,site,manifest,overrides] = await Promise.all(
  ['artists','performances','clips','series','site','media-manifest','youtube-overrides'].map(readJson));
const validated = validateCatalog({ artists,performances,clips,series,site },manifest,path=>existsSync(resolve('public',`.${path}`)));
if (!validated.ok) throw new Error(validated.errors.join('\n'));
const records: SeedRecord[] = [];
for (const [kind,items] of [['artist',artists],['performance',performances],['clip',clips],['series',series]] as const) {
  for (const item of items) records.push({kind,stableId:item.id,payload:parseEditorialPayload(kind,item.id,item)});
}
records.push({kind:'site',stableId:'site',payload:site});
for (const item of youtubeOverridesSchema.parse(overrides)) records.push({kind:'youtube-review',stableId:item.youtubeId,payload:item});
const sql = seedSql(records);
if (args.includes('--write')) {
  await writeAtomic(resolve('.local/editorial-seed.sql'),sql);
  console.log(`Prepared ${records.length} validated records in .local/editorial-seed.sql. No database was changed.`);
} else console.log(`Dry run: ${records.length} records validated; no files or database changed. Add --write to prepare the seed SQL.`);
