import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';
import {diffRevisionPayload,type RevisionChange} from './revision-diff';

export const historyPageSize=20;
type Row={id:string;version:number;created_at:string;payload:unknown};
export type HistoryEntry={id:string;version:number;createdAt:string;changes:RevisionChange[];first:boolean};

export function historyPage(value:string|null):number {
  const page=Number(value);
  return Number.isInteger(page)&&page>=1&&page<=1000?page:1;
}

/** Rows are newest first and include one extra older row, used only as the diff baseline. */
export function historyEntries(rows:Row[],pageSize=historyPageSize):{entries:HistoryEntry[];hasMore:boolean} {
  const hasMore=rows.length>pageSize;
  const entries=rows.slice(0,pageSize).map((row,index)=>{
    const older=rows[index+1];
    return {id:row.id,version:row.version,createdAt:row.created_at,first:!older,changes:older?diffRevisionPayload(row.payload,older.payload):[]};
  });
  return {entries,hasMore};
}

export async function loadRevisionHistory(client:SupabaseClient<Database>,itemId:string,page:number) {
  const from=(page-1)*historyPageSize;
  const result=await client.from('content_revisions').select('id,version,created_at,payload').eq('item_id',itemId)
    .order('version',{ascending:false}).range(from,from+historyPageSize);
  if(result.error) return {error:true as const};
  return {error:false as const,...historyEntries(result.data as Row[])};
}
