import type {SupabaseClient} from '@supabase/supabase-js';
import type {Database} from './database.types';

export type ReviewFeedback={id:string;createdAt:string;body:string;revision:number|null};

/** Newest feedback first. Row-level security limits this to items the signed-in member can see. */
export async function loadReviewFeedback(client:SupabaseClient<Database>,itemId:string,limit=10):Promise<{items:ReviewFeedback[];error:boolean}> {
  const comments=await client.from('editorial_review_comments').select('id,created_at,body,revision_id').eq('item_id',itemId)
    .order('created_at',{ascending:false}).limit(limit);
  if(comments.error) return {items:[],error:true};
  const ids=[...new Set(comments.data.map(comment=>comment.revision_id))];
  const versions=new Map<string,number>();
  if(ids.length) {
    const revisions=await client.from('content_revisions').select('id,version').in('id',ids);
    if(revisions.error) return {items:[],error:true};
    for(const revision of revisions.data) versions.set(revision.id,revision.version);
  }
  return {error:false,items:comments.data.map(comment=>({id:comment.id,createdAt:comment.created_at,body:comment.body,revision:versions.get(comment.revision_id)??null}))};
}
