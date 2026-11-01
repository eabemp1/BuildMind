-- NULL means the founder has not used a note reading. An empty array means it
-- was read and no supported insight was found, which still counts toward the allowance.
alter table public.conversation_people
  alter column insights drop not null,
  alter column insights drop default;

-- Rows created by the previous default but never given notes have not been read.
update public.conversation_people
set insights = null
where insights = '[]'::jsonb and notes is null;
