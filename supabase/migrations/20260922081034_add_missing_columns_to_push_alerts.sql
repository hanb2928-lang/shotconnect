/*
# Add missing columns to push_alerts table

1. Modified Tables
- `push_alerts` — add columns that the app code expects but were never created:
  - `hook_phrase` (text, nullable) — short marketing hook for the alert
  - `prompt_text` (text, nullable) — full prompt text for short-form generation
  - `triggered_at` (timestamptz, defaults to now()) — when the alert was triggered (app sorts by this)
  - `is_acted_on` (boolean, defaults false) — whether the user acted on the alert
  - `read_at` (timestamptz, nullable) — when the user dismissed/read the alert

2. Why
The app's `fetchUnreadAlerts()` queries `.order('triggered_at')` and the
`TriggerBanner` component reads `triggered_at`, `hook_phrase`, `prompt_text`,
`is_acted_on`, and `read_at`. Without these columns, Supabase returns a 400
error on startup, which crashes the app.

3. Security
No changes to RLS or policies. Existing policies remain intact.
*/

ALTER TABLE push_alerts
  ADD COLUMN IF NOT EXISTS hook_phrase text,
  ADD COLUMN IF NOT EXISTS prompt_text text,
  ADD COLUMN IF NOT EXISTS triggered_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_acted_on boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;
