-- Usage counters for 3D reverse (how many times each cached object was served).
ALTER TABLE public.object3d_reverse_cache
  ADD COLUMN IF NOT EXISTS views integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_object3d_views(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.object3d_reverse_cache
  SET views = views + 1
  WHERE slug = p_slug;
$$;

GRANT EXECUTE ON FUNCTION public.increment_object3d_views(text) TO anon, authenticated;

CREATE OR REPLACE VIEW public.library_object3d_entries
WITH (security_invoker = true) AS
SELECT
  slug,
  title,
  left(prompt, 180) AS prompt,
  cached_at,
  views
FROM public.object3d_reverse_cache;

GRANT SELECT ON public.library_object3d_entries TO anon, authenticated;
