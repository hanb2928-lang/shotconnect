// Weather Check Edge Function
// Fetches live weather data from Open-Meteo API (free, no API key required)
// Returns current temperature, precipitation, and weather code for a given lat/lon.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lon = url.searchParams.get("lon");
    const coldThreshold = parseFloat(url.searchParams.get("cold") || "0");
    const hotThreshold = parseFloat(url.searchParams.get("hot") || "35");

    if (!lat || !lon) {
      return new Response(
        JSON.stringify({ error: "Missing lat/lon parameters" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Open-Meteo free API — no key required
    // Current weather + precipitation in one call
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${parseFloat(lat)}&longitude=${parseFloat(lon)}&current=temperature_2m,precipitation,weather_code&timezone=auto`;

    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      return new Response(
        JSON.stringify({ error: "Weather API request failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const weatherJson = await weatherRes.json();
    const current = weatherJson.current;

    if (!current) {
      return new Response(
        JSON.stringify({ error: "No current weather data available" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const temperature = current.temperature_2m;
    const precipitation = current.precipitation ?? 0;
    const weatherCode = current.weather_code ?? 0;

    // Classify weather using WMO codes
    const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
    const snowCodes = [71, 73, 75, 77, 85, 86];

    const isRaining = rainCodes.includes(weatherCode) || (precipitation > 0.5 && temperature > 0);
    const isSnowing = snowCodes.includes(weatherCode) || (precipitation > 0.5 && temperature <= 0);
    const isCold = temperature <= coldThreshold;
    const isHot = temperature >= hotThreshold;

    return new Response(
      JSON.stringify({
        temperature,
        precipitation,
        weather_code: weatherCode,
        is_raining: isRaining,
        is_snowing: isSnowing,
        is_cold: isCold,
        is_hot: isHot,
        checked_at: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Weather check failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
