ALTER TABLE public.profiles
ADD COLUMN whatsapp_phone TEXT;

COMMENT ON COLUMN public.profiles.whatsapp_phone IS 'WhatsApp phone number with Brazilian DDD, stored as digits only.';