-- Founder Radar: opportunities, programs, events, meetings and people.
CREATE TABLE IF NOT EXISTS public.radar_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.projects(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('event', 'program', 'meeting', 'person')),
  kind text NOT NULL CHECK (kind IN ('hackathon', 'competition', 'grant', 'accelerator', 'conference', 'workshop', 'webinar', 'meetup', 'meeting', 'person')),
  kind_confirmed boolean NOT NULL DEFAULT false,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  organizer text,
  url text,
  location text,
  is_virtual boolean NOT NULL DEFAULT false,
  meeting_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  deadline_at timestamptz,
  eligibility text,
  cost text,
  role text CHECK (role IS NULL OR role IN ('customer', 'mentor', 'investor', 'cofounder', 'collaborator', 'other')),
  next_follow_up_at timestamptz,
  last_contacted_at timestamptz,
  notes text,
  source_text text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'saved', 'applied', 'attending', 'done', 'dismissed')),
  fit_score integer,
  fit_reasons jsonb,
  prep jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS radar_items_user_created_idx ON public.radar_items (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS radar_items_user_project_idx ON public.radar_items (user_id, project_id);

ALTER TABLE public.radar_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own radar items" ON public.radar_items;
CREATE POLICY "Users manage own radar items" ON public.radar_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
