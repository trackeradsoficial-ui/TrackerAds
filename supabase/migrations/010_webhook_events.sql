CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid,
  phone_raw text,
  event_type text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup
  ON webhook_events (client_id, phone_raw, event_type, created_at);
