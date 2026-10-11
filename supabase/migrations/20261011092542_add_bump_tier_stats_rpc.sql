
CREATE OR REPLACE FUNCTION bump_tier_stats(
  p_scans_delta INT DEFAULT 0,
  p_clicks_delta INT DEFAULT 0,
  p_revenue_delta INT DEFAULT 0
)
RETURNS TABLE (
  id INT,
  total_scans INT,
  total_clicks INT,
  total_revenue INT,
  tier_points INT,
  tier_level TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_points INT;
  v_level TEXT;
BEGIN
  UPDATE creator_tier
  SET
    total_scans = total_scans + p_scans_delta,
    total_clicks = total_clicks + p_clicks_delta,
    total_revenue = total_revenue + p_revenue_delta,
    updated_at = now()
  WHERE id = 1
  RETURNING total_scans, total_clicks, total_revenue INTO v_points, v_points, v_points;

  -- Recompute tier_points and level from the new totals
  SELECT * INTO v_points, v_level FROM (
    SELECT
      GREATEST(total_scans, 0) * 1 + GREATEST(total_clicks, 0) * 3 + LEAST(total_revenue, 999999) / 100,
      CASE
        WHEN total_scans * 1 + total_clicks * 3 + total_revenue / 100 >= 500 THEN 'platinum'
        WHEN total_scans * 1 + total_clicks * 3 + total_revenue / 100 >= 200 THEN 'gold'
        WHEN total_scans * 1 + total_clicks * 3 + total_revenue / 100 >= 50 THEN 'silver'
        ELSE 'bronze'
      END
    FROM creator_tier WHERE id = 1
  ) AS calc(points, level);

  UPDATE creator_tier
  SET tier_points = v_points, tier_level = v_level
  WHERE id = 1;

  RETURN QUERY SELECT * FROM creator_tier WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION bump_tier_stats(INT, INT, INT) TO authenticated;
