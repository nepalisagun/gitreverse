-- Optional store for generated Meshy GLBs. Local disk (data/game-assets) still works without this.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('game-assets', 'game-assets', false, 20971520)
ON CONFLICT (id) DO NOTHING;
