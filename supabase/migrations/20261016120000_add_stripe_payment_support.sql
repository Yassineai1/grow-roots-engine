-- Migration: Add Stripe payment provider support (additive, backward-compatible)
-- Adds stripe_* columns and a dedicated Stripe setter RPC.

ALTER TABLE app_private.business_payment_config
  ADD COLUMN IF NOT EXISTS stripe_secret_key text,
  ADD COLUMN IF NOT EXISTS stripe_publishable_key text,
  ADD COLUMN IF NOT EXISTS stripe_webhook_secret text,
  ADD COLUMN IF NOT EXISTS stripe_mode text;

DROP FUNCTION IF EXISTS public.get_business_payment_secrets(uuid);

CREATE OR REPLACE FUNCTION public.get_business_payment_secrets(_business_id uuid)
RETURNS TABLE(
  merchant_id text,
  store_key text,
  mode text,
  payment_configured boolean,
  provider text,
  stripe_secret_key text,
  stripe_publishable_key text,
  stripe_webhook_secret text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.cmi_merchant_id,
         c.cmi_store_key,
         CASE WHEN c.provider = 'stripe' THEN c.stripe_mode ELSE c.cmi_mode END,
         c.payment_configured,
         c.provider,
         c.stripe_secret_key,
         c.stripe_publishable_key,
         c.stripe_webhook_secret
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
    provider = 'cmi',
    cmi_merchant_id = EXCLUDED.cmi_merchant_id,
    cmi_store_key = EXCLUDED.cmi_store_key,
    cmi_mode = EXCLUDED.cmi_mode,
    payment_configured = EXCLUDED.payment_configured,
    updated_at = now();
END; $$;

REVOKE ALL ON FUNCTION public.set_business_payment_config(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_payment_config(uuid, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.set_business_stripe_config(
  _business_id uuid,
  _secret_key text,
  _publishable_key text,
  _webhook_secret text,
  _mode text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  final_secret text;
  final_pub text;
  final_webhook text;
BEGIN
  IF _mode NOT IN ('test','live') THEN
    RAISE EXCEPTION 'Invalid payment mode';
  END IF;

  SELECT COALESCE(NULLIF(_secret_key,''), c.stripe_secret_key),
         COALESCE(NULLIF(_publishable_key,''), c.stripe_publishable_key),
         COALESCE(NULLIF(_webhook_secret,''), c.stripe_webhook_secret)
    INTO final_secret, final_pub, final_webhook
  FROM (SELECT _business_id AS bid) x
  LEFT JOIN app_private.business_payment_config c ON c.business_id = x.bid;

  INSERT INTO app_private.business_payment_config
    (business_id, provider, stripe_secret_key, stripe_publishable_key,
     stripe_webhook_secret, stripe_mode, payment_configured)
  VALUES (_business_id, 'stripe', final_secret, final_pub, final_webhook, _mode,
          final_secret IS NOT NULL AND final_secret <> ''
          AND final_pub IS NOT NULL AND final_pub <> '')
  ON CONFLICT (business_id) DO UPDATE SET
    provider = 'stripe',
    stripe_secret_key = EXCLUDED.stripe_secret_key,
    stripe_publishable_key = EXCLUDED.stripe_publishable_key,
    stripe_webhook_secret = EXCLUDED.stripe_webhook_secret,
    stripe_mode = EXCLUDED.stripe_mode,
    payment_configured = EXCLUDED.payment_configured,
    updated_at = now();
END; $$;

REVOKE ALL ON FUNCTION public.set_business_stripe_config(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_business_stripe_config(uuid, text, text, text, text) TO service_role;
