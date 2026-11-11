import {createHash} from 'node:crypto';

// Parents before children. Restore runs with triggers off (like pg_restore --disable-triggers), so the
// order only matters for readability; integrity is proven afterwards by checkIntegrity().
export const backupTables=[
  'team_members','content_items','content_revisions','editorial_audit','team_audit',
  'editorial_releases','editorial_assets','editorial_invitations','editorial_invitation_events','editorial_review_comments',
] as const;
export type BackupTable=typeof backupTables[number];
export type Row=Record<string,unknown>;
export type BackupData=Record<BackupTable,Row[]>;
export type BackupManifest={schemaVersion:1;createdAt:string;tables:Record<BackupTable,{rows:number;sha256:string}>};

export function canonicalJson(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if(value&&typeof value==='object') {
    const object=value as Row;
    return `{${Object.keys(object).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value??null);
}

/** Order-independent digest of one table's rows. */
export function tableDigest(rows:Row[]):string {
  return createHash('sha256').update(rows.map(canonicalJson).sort().join('\n')).digest('hex');
}

export function buildManifest(data:BackupData,now=new Date()):BackupManifest {
  const tables={} as BackupManifest['tables'];
  for(const table of backupTables) tables[table]={rows:data[table].length,sha256:tableDigest(data[table])};
  return {schemaVersion:1,createdAt:now.toISOString(),tables};
}

/** Rows as plain JSON (dates as ISO text, bigints as numbers) so they hash and serialize identically everywhere. */
export function plainRows(rows:Row[]):Row[] {
  return JSON.parse(JSON.stringify(rows,(_key,value)=>typeof value==='bigint'?Number(value):value));
}

/** Reads every table through a caller-supplied reader (hosted API or a local database). */
export async function exportBackup(read:(table:BackupTable)=>Promise<Row[]>):Promise<{data:BackupData;manifest:BackupManifest}> {
  const data={} as BackupData;
  for(const table of backupTables) data[table]=plainRows(await read(table));
  return {data,manifest:buildManifest(data)};
}

export function verifyManifest(data:BackupData,manifest:BackupManifest):string[] {
  const problems:string[]=[];
  if(manifest.schemaVersion!==1) problems.push('Unsupported backup schema version.');
  for(const table of backupTables) {
    const expected=manifest.tables?.[table];
    if(!expected) {problems.push(`Manifest is missing ${table}.`);continue;}
    if(!Array.isArray(data[table])) {problems.push(`Backup is missing ${table}.`);continue;}
    if(data[table].length!==expected.rows) problems.push(`${table}: expected ${expected.rows} rows, found ${data[table].length}.`);
    else if(tableDigest(data[table])!==expected.sha256) problems.push(`${table}: contents do not match the manifest.`);
  }
  return problems;
}

type Db={exec(sql:string):Promise<unknown>;query<T=Row>(sql:string,params?:unknown[]):Promise<{rows:T[]}>};

/** Restores into a database that already has the migrations applied and is empty. */
export async function restoreBackup(db:Db,data:BackupData):Promise<void> {
  await db.exec('reset role');
  await db.exec("set session_replication_role = replica");
  try {
    for(const table of backupTables) {
      if(!data[table].length) continue;
      const columns=(await db.query<{column_name:string}>(
        "select column_name from information_schema.columns where table_schema='public' and table_name=$1 and is_generated='NEVER' order by ordinal_position",[table])).rows.map(row=>row.column_name);
      const list=columns.map(column=>`"${column}"`).join(',');
      await db.query(`insert into public.${table}(${list}) overriding system value select ${list} from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,[JSON.stringify(data[table])]);
    }
    for(const table of ['editorial_audit','team_audit','editorial_invitation_events'] as const) {
      await db.query(`select setval(pg_get_serial_sequence('public.${table}','id'),greatest(coalesce((select max(id) from public.${table}),0),1),(select count(*)>0 from public.${table}))`);
    }
  } finally {
    await db.exec('set session_replication_role = origin');
  }
}

/** Referential and logical checks that must hold in any good backup. Returns problems; empty means sound. */
export async function checkIntegrity(db:Db):Promise<string[]> {
  const checks:[string,string][]=[
    ['revisions without an item',"select count(*) n from public.content_revisions r where not exists(select 1 from public.content_items i where i.id=r.item_id)"],
    ['items whose draft revision is missing',"select count(*) n from public.content_items i where i.draft_revision_id is not null and not exists(select 1 from public.content_revisions r where r.id=i.draft_revision_id and r.item_id=i.id)"],
    ['items whose approved revision is missing',"select count(*) n from public.content_items i where i.approved_revision_id is not null and not exists(select 1 from public.content_revisions r where r.id=i.approved_revision_id and r.item_id=i.id)"],
    ['items whose version does not match their draft revision',"select count(*) n from public.content_items i join public.content_revisions r on r.id=i.draft_revision_id where r.version<>i.version"],
    ['duplicate revision numbers within an item',"select count(*) n from (select item_id,version from public.content_revisions group by 1,2 having count(*)>1) d"],
    ['audit rows pointing at missing items',"select count(*) n from public.editorial_audit a where a.item_id is not null and not exists(select 1 from public.content_items i where i.id=a.item_id)"],
    ['review comments pointing at missing revisions',"select count(*) n from public.editorial_review_comments c where not exists(select 1 from public.content_revisions r where r.id=c.revision_id and r.item_id=c.item_id)"],
    ['assets with a bad status',"select count(*) n from public.editorial_assets where status not in ('pending','ready','failed','archived')"],
    ['team has no active owner',"select (case when exists(select 1 from public.team_members where role='owner' and active) then 0 else 1 end) n"],
  ];
  const problems:string[]=[];
  for(const [label,sql] of checks) {
    const n=Number((await db.query<{n:string|number}>(sql)).rows[0]?.n??0);
    if(n>0) problems.push(`${n} ${label}.`);
  }
  return problems;
}
