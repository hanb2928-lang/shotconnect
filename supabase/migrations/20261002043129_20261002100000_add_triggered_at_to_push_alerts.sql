/*
# Add triggered_at column to push_alerts

1. Schema change
- Add `triggered_at timestamptz DEFAULT now()` to `push_alerts`.
- The frontend code orders push_alerts by `triggered_at` but the column
  was missing from the baseline schema, causing a 400 error on every query.

2. Data safety
- Additive only: no columns removed, no data lost.
- Idempotent: uses DO $$ ... IF NOT EXISTS ... END $$.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'push_alerts' AND column_name = 'triggered_at'
  ) THEN
    ALTER TABLE public.push_alerts ADD COLUMN triggered_at timestamptz DEFAULT now();
  END IF;
END $$;

UPDATE public.push_alerts
SET triggered_at = created_at
WHERE triggered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_push_alerts_triggered_at
ON public.push_alerts (triggered_at DESC);