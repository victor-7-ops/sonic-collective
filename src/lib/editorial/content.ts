import { artistSchema, performanceSchema, clipSchema, seriesSchema, siteConfigSchema } from '../schemas';
import { youtubeOverridesSchema } from '../merge-catalog';
import { z } from 'zod';

export const editorialKindSchema = z.enum(['artist','performance','clip','series','site','youtube-review']);
export type EditorialKind = z.infer<typeof editorialKindSchema>;
export const editorialKindLabels:Record<string,string>={artist:'Artist',performance:'Performance',clip:'Teaser clip',series:'Series',site:'Homepage','youtube-review':'YouTube review'};
export const editorialStatusLabels:Record<string,string>={draft:'Draft','in-review':'In review','changes-requested':'Changes requested',approved:'Approved'};
const stableId = z.string().regex(/^[A-Za-z0-9_-]{1,120}$/);
const schemas = {
  artist: artistSchema, performance: performanceSchema, clip: clipSchema,
  series: seriesSchema, site: siteConfigSchema, 'youtube-review': youtubeOverridesSchema.element,
};

export function parseEditorialPayload(kind: EditorialKind, id: string, input: unknown) {
  stableId.parse(id);
  const parsed = schemas[kind].parse(input);
  if (kind === 'site' && id !== 'site') throw new Error('Invalid site settings ID');
  if ('id' in parsed && parsed.id !== id) throw new Error('Content ID cannot change');
  if ('youtubeId' in parsed && kind === 'youtube-review' && parsed.youtubeId !== id) throw new Error('YouTube ID cannot change');
  return parsed;
}

export type SeedRecord = { kind: EditorialKind; stableId: string; payload: Record<string,unknown> };

export function seedSql(records: SeedRecord[]): string {
  const quote = (text: string) => `'${text.replaceAll("'", "''")}'`;
  const statements = records.map(record => {
    const payload = parseEditorialPayload(record.kind,record.stableId,record.payload);
    const body = `
declare v_item uuid; v_revision uuid;
begin
  insert into public.content_items(kind,stable_id) values(${quote(record.kind)},${quote(record.stableId)})
    on conflict(kind,stable_id) do nothing returning id into v_item;
  if v_item is not null then
    insert into public.content_revisions(item_id,version,payload) values(v_item,1,${quote(JSON.stringify(payload))}::jsonb) returning id into v_revision;
    update public.content_items set version=1,draft_revision_id=v_revision,approved_revision_id=v_revision,review_state='approved' where id=v_item;
    insert into public.editorial_audit(item_id,revision_id,action) values(v_item,v_revision,'import');
  end if;
end
`;
    let suffix = 0;
    while (body.includes(`$seed_${suffix}$`)) suffix++;
    const delimiter = `$seed_${suffix}$`;
    return `do ${delimiter}${body}${delimiter};`;
  });
  return `-- Generated from validated existing public content. Never overwrites existing CMS records.\nbegin;\nset local standard_conforming_strings = on;\n${statements.join('\n')}\ncommit;\n`;
}
