CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'platform_admin');
$$;

CREATE OR REPLACE FUNCTION app_private.owns_business(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.businesses b WHERE b.id = _business_id AND b.owner_id = auth.uid());
$$;

GRANT USAGE ON SCHEMA app_private TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION app_private.owns_business(uuid) TO authenticated;

DROP POLICY "users_select_own" ON public.users;
CREATE POLICY "users_select_own" ON public.users FOR SELECT TO authenticated USING (id = auth.uid() OR app_private.is_platform_admin());

DROP POLICY "businesses_select" ON public.businesses;
CREATE POLICY "businesses_select" ON public.businesses FOR SELECT TO authenticated USING (owner_id = auth.uid() OR app_private.is_platform_admin());

DROP POLICY "staff_select" ON public.staff;
DROP POLICY "staff_insert" ON public.staff;
DROP POLICY "staff_update" ON public.staff;
DROP POLICY "staff_delete" ON public.staff;
CREATE POLICY "staff_select" ON public.staff FOR SELECT TO authenticated USING (app_private.owns_business(business_id) OR app_private.is_platform_admin());
CREATE POLICY "staff_insert" ON public.staff FOR INSERT TO authenticated WITH CHECK (app_private.owns_business(business_id));
CREATE POLICY "staff_update" ON public.staff FOR UPDATE TO authenticated USING (app_private.owns_business(business_id)) WITH CHECK (app_private.owns_business(business_id));
CREATE POLICY "staff_delete" ON public.staff FOR DELETE TO authenticated USING (app_private.owns_business(business_id));

DROP POLICY "clients_select" ON public.clients;
DROP POLICY "clients_insert" ON public.clients;
DROP POLICY "clients_update" ON public.clients;
DROP POLICY "clients_delete" ON public.clients;
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated USING (app_private.owns_business(business_id) OR app_private.is_platform_admin());
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated WITH CHECK (app_private.owns_business(business_id));
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated USING (app_private.owns_business(business_id)) WITH CHECK (app_private.owns_business(business_id));
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated USING (app_private.owns_business(business_id));

DROP FUNCTION public.is_platform_admin();
DROP FUNCTION public.owns_business(uuid);