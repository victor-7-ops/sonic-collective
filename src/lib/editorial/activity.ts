export type ActivityKind='content'|'release'|'team';
export type ActivityEvent={at:string;kind:ActivityKind;actor:string;summary:string;href?:string};

export type AuditRow={id:number;actor_id:string|null;item_id:string|null;action:string;created_at:string};
export type ReleaseRow={id:string;created_by:string;created_at:string};
export type LiveRow={id:number;release_id:string;set_by:string;set_at:string};
export type TeamAuditRow={id:number;actor_id:string;target_user_id:string|null;item_id:string|null;action:string;old_role:string|null;new_role:string|null;old_active:boolean|null;new_active:boolean|null;created_at:string};

export type ActivityLabels={
  actor:(id:string|null)=>string;
  item:(id:string|null)=>{label:string;href:string}|null;
};

const contentVerb:Record<string,string>={
  create:'created',save:'saved a draft of',submit:'submitted for review',approve:'approved',
  'request-changes':'requested changes on',restore:'restored an earlier revision of',archive:'archived',unarchive:'restored from the archive',
};

export const activityTypes=['all','content','release','team'] as const;
export type ActivityFilter=typeof activityTypes[number];
export const activityFilter=(value:string|null):ActivityFilter=>activityTypes.find(type=>type===value)??'all';

/** One readable, newest-first feed from the CMS's permanent records. Rows the viewer cannot read simply never arrive. */
export function buildActivity(
  input:{audit:AuditRow[];releases:ReleaseRow[];live:LiveRow[];team:TeamAuditRow[]},
  labels:ActivityLabels,filter:ActivityFilter='all',limit=100,
):ActivityEvent[] {
  const events:ActivityEvent[]=[];
  for(const row of input.audit) {
    const item=labels.item(row.item_id);
    const subject=item?item.label:'a record';
    const actor=row.action==='import'&&!row.actor_id?'System':labels.actor(row.actor_id);
    events.push({
      at:row.created_at,kind:'content',actor,
      summary:row.action==='import'?`imported ${subject} from the repository`:`${contentVerb[row.action]??row.action} ${subject}`,
      ...(item?{href:item.href}:{}),
    });
  }
  for(const row of input.releases) events.push({at:row.created_at,kind:'release',actor:labels.actor(row.created_by),summary:`prepared release ${row.id.slice(0,8)}`,href:'/admin/releases/'});
  for(const row of input.live) events.push({at:row.set_at,kind:'release',actor:labels.actor(row.set_by),summary:`made release ${row.release_id.slice(0,8)} live`,href:'/admin/releases/'});
  for(const row of input.team) {
    const target=labels.actor(row.target_user_id);
    const item=labels.item(row.item_id);
    const details=[
      row.new_role&&row.old_role!==row.new_role?`role ${row.old_role??'none'} → ${row.new_role}`:'',
      row.new_active!==null&&row.old_active!==row.new_active?(row.new_active?'activated':'deactivated'):'',
    ].filter(Boolean);
    const summary=row.action==='assignment-change'
      ?`changed who owns ${item?item.label:'a record'}`
      :`changed access for ${target}${details.length?` (${details.join(', ')})`:''}`;
    events.push({at:row.created_at,kind:'team',actor:labels.actor(row.actor_id),summary,...(item?{href:item.href}:{})});
  }
  return events.filter(event=>filter==='all'||event.kind===filter).sort((a,b)=>a.at<b.at?1:a.at>b.at?-1:0).slice(0,limit);
}
