// A throwaway in-memory Postgres with the real migrations applied and Supabase's auth/storage stubbed.
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

export async function migratedScratchDb(userIds:string[]=[]):Promise<PGlite> {
  const db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email varchar(255)); create table auth.mfa_factors(user_id uuid,status text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated; grant execute on all functions in schema auth to anon,authenticated;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
  `);
  const migrations=new URL('../../supabase/migrations/',import.meta.url);
  for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(name,migrations),'utf8'));
  for(const id of userIds) await db.query('insert into auth.users(id) values($1)',[id]);
  return db;
}
