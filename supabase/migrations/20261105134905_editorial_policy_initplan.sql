alter policy editorial_item_read on public.content_items using (
  (select editorial_private.member_role()) in ('owner','editor') or
  ((select editorial_private.member_role()) = 'contributor' and owner_id = (select auth.uid()) and kind in ('artist','performance','clip'))
);
