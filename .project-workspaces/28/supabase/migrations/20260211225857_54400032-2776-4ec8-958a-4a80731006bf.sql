-- Make slide-assets bucket public so audio can play in presentations
UPDATE storage.buckets SET public = true WHERE id = 'slide-assets';

-- Ensure public read access for slide assets
CREATE POLICY "Public read access for slide assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'slide-assets');
