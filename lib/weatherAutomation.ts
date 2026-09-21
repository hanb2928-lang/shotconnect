import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

export interface WeatherAlertSettings {
  id: number;
  enabled: boolean;
  store_latitude: number | null;
  store_longitude: number | null;
  store_name: string | null;
  rain_alert_enabled: boolean;
  cold_snap_threshold: number;
  heat_wave_threshold: number;
  last_weather_check: string | null;
  last_alert_type: string | null;
  updated_at: string;
}

export interface WeatherAlert {
  id: string;
  alert_type: 'rain' | 'snow' | 'cold_snap' | 'heat_wave';
  title: string;
  body: string;
  hook_phrase: string | null;
  prompt_text: string | null;
  temperature: number | null;
  precipitation: number | null;
  weather_code: number | null;
  is_read: boolean;
  is_acted_on: boolean;
  triggered_at: string;
  read_at: string | null;
  visitor_count: number;
  revenue_impact: number;
  shortform_created: boolean;
  result_note: string | null;
}

export interface WeatherData {
  temperature: number;
  precipitation: number;
  weather_code: number;
  is_raining: boolean;
  is_snowing: boolean;
  is_cold: boolean;
  is_hot: boolean;
}

const SETTINGS_ID = 1;

// WMO weather codes: https://open-meteo.com/en/docs
// 51-67 = drizzle/rain, 71-77 = snow, 80-82 = rain showers, 85-86 = snow showers
function classifyWeather(code: number, temp: number, precip: number, coldThreshold: number, hotThreshold: number): WeatherData {
  const rainCodes = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
  const snowCodes = [71, 73, 75, 77, 85, 86];
  return {
    temperature: temp,
    precipitation: precip,
    weather_code: code,
    is_raining: rainCodes.includes(code) || (precip > 0.5 && temp > 0),
    is_snowing: snowCodes.includes(code) || (precip > 0.5 && temp <= 0),
    is_cold: temp <= coldThreshold,
    is_hot: temp >= hotThreshold,
  };
}

export function determineWeatherAlert(
  weather: WeatherData,
  settings: WeatherAlertSettings,
): { type: WeatherAlert['alert_type']; title: string; body: string; hook_phrase: string; prompt_text: string } | null {
  const storeName = settings.store_name || '우리 매장';

  if (settings.rain_alert_enabled && weather.is_snowing) {
    return {
      type: 'snow',
      title: '눈 내림! 따뜻한 메뉴 긴급 마케팅',
      body: `사장님, 눈이 내리고 있어요! 지금 뚝딱 누르면 반경 1km 내 직장인들에게 '${storeName} 따뜻한 국물+특가' 숏폼이 자동 발송됩니다!`,
      hook_phrase: '눈 오는 날 특가',
      prompt_text: `눈 내리는 날, 몸 녹이는 따뜻한 국물 메뉴 특가! 지금 방문하시면 뜨끈한 한 그릇 서비스`,
    };
  }

  if (settings.rain_alert_enabled && weather.is_raining) {
    return {
      type: 'rain',
      title: '비 내림! 따뜻한 메뉴 긴급 마케팅',
      body: `사장님, 갑자기 비가 와서 홀이 텅 비었어요. 지금 뚝딱 누르면 반경 1km 내 우산 없는 직장인들에게 '${storeName} 따뜻한 어묵탕+소주 특가' 숏폼이 자동 발송됩니다!`,
      hook_phrase: '비 오는 날 특가',
      prompt_text: `비 오는 날, 우산 없는 직장인을 위한 따뜻한 어묵탕+소주 특가! 지금 들어오면 자리 예약`,
    };
  }

  if (weather.is_cold || weather.temperature <= settings.cold_snap_threshold) {
    return {
      type: 'cold_snap',
      title: '한파! 몸녹이는 메뉴 긴급 마케팅',
      body: `사장님, 기온이 ${weather.temperature}°C까지 떨어졌어요! 지금 뚝딱 누르면 '몸녹이는 뜨끈 국물+술 한잔' 숏폼이 자동 발송됩니다!`,
      hook_phrase: '한파 특가',
      prompt_text: `한파 때 몸 녹이는 뜨끈한 국물 메뉴 특가! 밖에서 춥다면 지금 바로 들어오세요`,
    };
  }

  if (weather.is_hot || weather.temperature >= settings.heat_wave_threshold) {
    return {
      type: 'heat_wave',
      title: '폭염! 시원한 메뉴 긴급 마케팅',
      body: `사장님, 기온이 ${weather.temperature}°C까지 올랐어요! 지금 뚝딱 누르면 '시원한 냉면+아이스 음료 특가' 숏폼이 자동 발송됩니다!`,
      hook_phrase: '폭염 특가',
      prompt_text: `폭염 날, 시원한 냉면 + 아이스 음료 특가! 에어컨 틀어놓고 시원하게 한 끼 어떠세요?`,
    };
  }

  return null;
}

export async function getWeatherAlertSettings(): Promise<WeatherAlertSettings | null> {
  const { data, error } = await supabase
    .from('weather_alert_settings')
    .select('*')
    .eq('id', SETTINGS_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WeatherAlertSettings | null;
}

export async function updateWeatherAlertSettings(
  updates: Partial<WeatherAlertSettings>,
): Promise<void> {
  const { error } = await supabase
    .from('weather_alert_settings')
    .upsert({
      id: SETTINGS_ID,
      ...updates,
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(error.message);
}

export async function fetchWeatherAlerts(limit = 20): Promise<WeatherAlert[]> {
  const { data, error } = await supabase
    .from('weather_alerts')
    .select('*')
    .order('triggered_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as WeatherAlert[];
}

export async function createWeatherAlert(
  alert: Partial<WeatherAlert> & Pick<WeatherAlert, 'alert_type' | 'title' | 'body'>,
): Promise<WeatherAlert | null> {
  const { data, error } = await supabase
    .from('weather_alerts')
    .insert(alert)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as WeatherAlert | null;
}

export async function markWeatherAlertRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('weather_alerts')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function markWeatherAlertActedOn(id: string): Promise<void> {
  const { error } = await supabase
    .from('weather_alerts')
    .update({ is_acted_on: true, is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteWeatherAlert(id: string): Promise<void> {
  const { error } = await supabase
    .from('weather_alerts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Fetch live weather from the edge function
export async function fetchLiveWeather(
  lat: number,
  lon: number,
  coldThreshold?: number,
  hotThreshold?: number,
): Promise<WeatherData> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  if (coldThreshold !== undefined) params.set('cold', String(coldThreshold));
  if (hotThreshold !== undefined) params.set('hot', String(hotThreshold));
  const url = `${supabaseUrl}/functions/v1/weather-check?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Weather API failed: ${res.status}`);
  const data = await res.json();
  return {
    temperature: data.temperature,
    precipitation: data.precipitation,
    weather_code: data.weather_code,
    is_raining: data.is_raining,
    is_snowing: data.is_snowing,
    is_cold: data.is_cold,
    is_hot: data.is_hot,
  };
}

export { classifyWeather };
