CREATE OR REPLACE FUNCTION public.get_business_payment_secrets(_business_id uuid)
RETURNS TABLE(merchant_id text, store_key text, mode text, payment_configured boolean, provider text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.cmi_merchant_id, c.cmi_store_key, c.cmi_mode, c.payment_configured, c.provider
  FROM app_private.business_payment_config c
  WHERE c.business_id = _business_id;
$$;
REVOKE ALL ON FUNCTION public.get_business_payment_secrets(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_payment_secrets(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_business_payment_config(
  _business_id uuid, _merchant_id text, _store_key text, _mode text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  final_merchant text;
  final_key text;
BEGIN
  IF _mode NOT IN ('test','live') THEN
    RAISE EXCEPTION 'Invalid payment mode';
  END IF;

  SELECT COALESCE(NULLIF(_merchant_id,''), c.cmi_merchant_id),
         COALESCE(NULLIF(_store_key,''), c.cmi_store_key)
    INTO final_merchant, final_key
  FROM (SELECT _business_id AS bid) x
  LEFT JOIN app_private.business_payment_config c ON c.business_id = x.bid;

  INSERT INTO app_private.business_payment_config
    (business_id, provider, cmi_merchant_id, cmi_store_key, cmi_mode, payment_configured)
  VALUES (_business_id, 'cmi', final_merchant, final_key, _mode,
          final_merchant IS NOT NULL AND final_merchant <> '' AND final_key IS NOT NULL AND final_key <> '')
  ON CONFLICT (business_id) DO UPDATE SET
    cmi_merchant_id = EXCLUDED.cmi_merchant_id,
    cmi_store_key = EXCLUDED.cmi_store_key,
    cmi_mode = EXCLUDED.cmi_mode,
    payment_configured = EXCLUDED.payment_configured,
    updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.set_business_payment_config(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_payment_config(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.clear_business_payment_config(_business_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM app_private.business_payment_config WHERE business_id = _business_id;
$$;
REVOKE ALL ON FUNCTION public.clear_business_payment_config(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_business_payment_config(uuid) TO service_role;