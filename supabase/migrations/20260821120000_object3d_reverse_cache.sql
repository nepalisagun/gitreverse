CREATE TABLE IF NOT EXISTS public.object3d_reverse_cache (
  slug text PRIMARY KEY,
  title text NOT NULL,
  prompt text NOT NULL,
  glb_filename text NOT NULL,
  source_filename text NULL,
  cached_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NULL
);

ALTER TABLE public.object3d_reverse_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon can read object3d_reverse_cache"
  ON public.object3d_reverse_cache
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "anon can insert object3d_reverse_cache"
  ON public.object3d_reverse_cache
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "anon can update object3d_reverse_cache"
  ON public.object3d_reverse_cache
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS object3d_reverse_cache_cached_at_idx
  ON public.object3d_reverse_cache (cached_at DESC);

-- Optional store for Meshy GLBs + source images. Local disk (data/object3d-assets) still works without this.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('object3d-assets', 'object3d-assets', false, 20971520)
ON CONFLICT (id) DO NOTHING;
