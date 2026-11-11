-- Reviewer feedback: a "request changes" decision always carries its reason, recorded in one transaction.
create table public.editorial_review_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.content_items(id) on delete restrict,
  revision_id uuid not null references public.content_revisions(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('request-changes')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index editorial_review_comments_item_idx on public.editorial_review_comments(item_id,created_at desc);
alter table public.editorial_review_comments enable row level security;
revoke all on public.editorial_review_comments from public,anon,authenticated;
grant select on public.editorial_review_comments to authenticated;
grant all on public.editorial_review_comments to service_role;
-- Visible exactly to those who can see the item (content_items policies apply inside the subquery).
create policy review_comments_read_accessible on public.editorial_review_comments for select to authenticated
  using (exists(select 1 from public.content_items item where item.id=item_id));
create trigger immutable_editorial_review_comment before update or delete on public.editorial_review_comments
  for each row execute function editorial_private.prevent_mutation();

create function editorial_private.request_changes(p_item_id uuid,p_revision_id uuid,p_body text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'A reason of 1 to 2000 characters is required' using errcode='22023';
  end if;
  -- Applies the same membership, role, revision-lock and MFA rules as every other review action.
  perform editorial_private.review_content(p_item_id,p_revision_id,'request-changes');
  insert into public.editorial_review_comments(item_id,revision_id,author_id,action,body)
    values(p_item_id,p_revision_id,auth.uid(),'request-changes',btrim(p_body));
end
$$;
revoke all on function editorial_private.request_changes(uuid,uuid,text) from public,anon;
grant execute on function editorial_private.request_changes(uuid,uuid,text) to authenticated;
create function public.request_editorial_changes(p_item_id uuid,p_revision_id uuid,p_body text)
returns void language sql security invoker set search_path = '' as $$
  select editorial_private.request_changes(p_item_id,p_revision_id,p_body)
$$;
revoke all on function public.request_editorial_changes(uuid,uuid,text) from public,anon;
grant execute on function public.request_editorial_changes(uuid,uuid,text) to authenticated;
