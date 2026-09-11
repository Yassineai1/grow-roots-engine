CREATE POLICY "branding_owner_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'business-branding' AND app_private.owns_business(((storage.foldername(name))[1])::uuid));

CREATE POLICY "branding_owner_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'business-branding' AND app_private.owns_business(((storage.foldername(name))[1])::uuid));

CREATE POLICY "branding_owner_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'business-branding' AND app_private.owns_business(((storage.foldername(name))[1])::uuid))
WITH CHECK (bucket_id = 'business-branding' AND app_private.owns_business(((storage.foldername(name))[1])::uuid));

CREATE POLICY "branding_owner_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'business-branding' AND app_private.owns_business(((storage.foldername(name))[1])::uuid));