/**
 * Self-Evolving Adaptive Intelligence Engine.
 * Tracks recently used content archetypes per function and enforces rotation.
 * Applies tone drift calibration to prevent user fatigue.
 */

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export interface ToneProfile {
  chaosLevel: number;   // 0-1: how unhinged/chaotic the humor is
  sincerityLevel: number; // 0-1: moments of genuine relatable sincerity
  cadence: 'rapid-fire' | 'conversational' | 'breathy-pause' | 'stream-of-conscious';
  memeFormat: string;   // which meme/trope family to draw from
}

export interface ArchetypeSet {
  archetypeKey: string;
  toneProfile: ToneProfile;
  instructionSnippet: string; // injected into the system prompt
}

// ─── Archetype pools per channel ────────────────────────────────────────

const COMIC_ARCHETYPES: ArchetypeSet[] = [
  {
    archetypeKey: 'trojan-frustration-burst',
    toneProfile: { chaosLevel: 0.7, sincerityLevel: 0.2, cadence: 'rapid-fire', memeFormat: 'everyday-rage-comic' },
    instructionSnippet: '첫 패널: 일상의 황당한 좌절 (예: 배송 3일째 연락 없음, 알람 5개 다 못 들음). 제품은 두 번째 패널에서 우연히 발견되는 구원자.',
  },
  {
    archetypeKey: 'absurd-plot-twist',
    toneProfile: { chaosLevel: 0.9, sincerityLevel: 0.1, cadence: 'rapid-fire', memeFormat: 'b-grade-plot-twist' },
    instructionSnippet: '첫 패널: 상황을 완전히 뒤엎는 황당한 반전 (예: 분양받은 줄 알았던 강아지가 사실은 너구리). 제품은 반전 이후 자연스럽게 해결책으로 등장.',
  },
  {
    archetypeKey: 'self-deprecating-confession',
    toneProfile: { chaosLevel: 0.4, sincerityLevel: 0.7, cadence: 'conversational', memeFormat: 'honest-confession' },
    instructionSnippet: '첫 패널: 자조적 고백 (예: "나 이런 거에 50만원 썼음..."). 공감과 부끄러움이 섞인 톤. 제품은 "근데 이건 달라"로 자연스럽게 연결.',
  },
  {
    archetypeKey: 'chaotic-meme-collage',
    toneProfile: { chaosLevel: 1.0, sincerityLevel: 0.05, cadence: 'stream-of-conscious', memeFormat: 'meme-collage' },
    instructionSnippet: '패널 구성을 짤방 콜라지처럼. 과장된 이모티콘 표정, 밈스러운 대사, 불규칙한 레이아웃. 제품은 마지막 패널에 "이거 쓰면 됨 ㅋ"로 등장.',
  },
  {
    archetypeKey: 'relatable-sincerity-spike',
    toneProfile: { chaosLevel: 0.2, sincerityLevel: 0.9, cadence: 'breathy-pause', memeFormat: 'genuine-moment' },
    instructionSnippet: '갑자기 진지한 공감 모먼트로 시작 (예: "퇴근하고 아무 말 없이 소파에 누울 때"). 진정성 있는 감정 후 제품이 자연스러운 위로로 등장.',
  },
  {
    archetypeKey: 'ironic-anti-recommendation',
    toneProfile: { chaosLevel: 0.6, sincerityLevel: 0.3, cadence: 'conversational', memeFormat: 'reverse-psychology' },
    instructionSnippet: '역심리로 시작 (예: "이거 사지 마. 진짜."). 호기심 유발 후 "근데 쓰면 진짜 편함"으로 반전.',
  },
];

const COPY_ARCHETYPES: ArchetypeSet[] = [
  {
    archetypeKey: 'reverse-psychology-hook',
    toneProfile: { chaosLevel: 0.6, sincerityLevel: 0.3, cadence: 'conversational', memeFormat: 'reverse-psychology' },
    instructionSnippet: '후킹: 역심리 ("이거 사지 마세요... 아니 꼭 사세요"). 캡션은 솔직한 경험담 톤.',
  },
  {
    archetypeKey: 'shocking-disclosure',
    toneProfile: { chaosLevel: 0.7, sincerityLevel: 0.2, cadence: 'rapid-fire', memeFormat: 'clickbait-subversion' },
    instructionSnippet: '후킹: 충격적 고백 ("이거 모르면 3년 손해"). 캡션은 구체적 경험으로 뒷받침, 과장 아님.',
  },
  {
    archetypeKey: 'insider-secret-tip',
    toneProfile: { chaosLevel: 0.3, sincerityLevel: 0.6, cadence: 'conversational', memeFormat: 'insider-knowledge' },
    instructionSnippet: '후킹: 내부자 꿀팁 톤 ("이거 아직 모르는 사람 있음?"). CTA도 "링크 남겨둠 — 알아서들" 톤.',
  },
  {
    archetypeKey: 'self-deprecating-review',
    toneProfile: { chaosLevel: 0.5, sincerityLevel: 0.7, cadence: 'stream-of-conscious', memeFormat: 'honest-confession' },
    instructionSnippet: '후킹: 자조적 고백 ("내돈내산인데 이거 왜 이제 알았지"). 진짜 후기 느낌.',
  },
  {
    archetypeKey: 'absurd-comparison',
    toneProfile: { chaosLevel: 0.8, sincerityLevel: 0.15, cadence: 'rapid-fire', memeFormat: 'absurd-analogy' },
    instructionSnippet: '후킹: 황당한 비유 ("이거 안 쓰면 맨발로 출근하는 거랑 같음"). 유머러스하게 주의 환기.',
  },
  {
    archetypeKey: 'quiet-sincerity',
    toneProfile: { chaosLevel: 0.15, sincerityLevel: 0.95, cadence: 'breathy-pause', memeFormat: 'genuine-moment' },
    instructionSnippet: '후킹: 차분하고 진정성 있는 한 줄 ("하루 끝에 이거 하나 켜두면 그냥 편해짐"). 감성적 공감.',
  },
];

const SHORTFORM_ARCHETYPES: ArchetypeSet[] = [
  {
    archetypeKey: 'dissonant-cold-open',
    toneProfile: { chaosLevel: 0.8, sincerityLevel: 0.1, cadence: 'rapid-fire', memeFormat: 'cold-open-shock' },
    instructionSnippet: '0-2초: 강렬한 부조화. 갑자기 화면이 꺼지거나 거친 모션이 터지는 연출. 음성: 역설적 내레이션.',
  },
  {
    archetypeKey: 'pain-point-amplification',
    toneProfile: { chaosLevel: 0.6, sincerityLevel: 0.4, cadence: 'rapid-fire', memeFormat: 'relatable-agony' },
    instructionSnippet: '0-2초: 일상의 짜증을 극대화 (소리, 자막, 모션). 시청자가 "아 이거 나도"라고 느끼게.',
  },
  {
    archetypeKey: 'absurd-visual-gag',
    toneProfile: { chaosLevel: 0.9, sincerityLevel: 0.05, cadence: 'stream-of-conscious', memeFormat: 'visual-gag' },
    instructionSnippet: '0-2초: 황당한 시각 개그로 시작. 제품과 무관해 보이는 장면으로 시선 강탈 후 자연스럽게 연결.',
  },
  {
    archetypeKey: 'sudden-sincerity-drop',
    toneProfile: { chaosLevel: 0.2, sincerityLevel: 0.9, cadence: 'breathy-pause', memeFormat: 'genuine-moment' },
    instructionSnippet: '0-2초: 갑자기 진지하고 차분한 모먼트. 시끄러운 숏폼 사이에서 대비 효과로 시선 강탈.',
  },
  {
    archetypeKey: 'ironic-anti-ad',
    toneProfile: { chaosLevel: 0.7, sincerityLevel: 0.2, cadence: 'conversational', memeFormat: 'reverse-psychology' },
    instructionSnippet: '0-2초: "이거 광고 아니면 뭐임?" 같은 역설적 오프닝. 자조적 유머로 시작.',
  },
  {
    archetypeKey: 'chaotic-energy-burst',
    toneProfile: { chaosLevel: 1.0, sincerityLevel: 0.05, cadence: 'rapid-fire', memeFormat: 'high-energy-chaos' },
    instructionSnippet: '0-2초: 극도로 빠른 컷, 거친 모션, 과장된 자막. 에너지 폭발로 스크롤 멈추기.',
  },
];

const ARCHETYPE_POOLS: Record<string, ArchetypeSet[]> = {
  'generate-comic-scenario': COMIC_ARCHETYPES,
  'generate-copy': COPY_ARCHETYPES,
  'generate-viral-shortform': SHORTFORM_ARCHETYPES,
};

// ─── Recent archetype retrieval ──────────────────────────────────────────

async function getRecentArchetypeKeys(functionName: string, limit: number = 3): Promise<string[]> {
  if (!supabaseUrl || !serviceRoleKey) return [];
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(
      `${supabaseUrl}/rest/v1/content_archetypes?select=archetype_key&function_name=eq.${functionName}&order=created_at.desc&limit=${limit}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);
    if (!resp.ok) return [];
    const rows = await resp.json() as Array<{ archetype_key: string }>;
    return rows.map((r) => r.archetype_key);
  } catch {
    return [];
  }
}

// ─── Log archetype usage ────────────────────────────────────────────────

async function logArchetypeUsage(
  functionName: string,
  archetypeKey: string,
  toneProfile: ToneProfile,
): Promise<void> {
  if (!supabaseUrl || !serviceRoleKey) return;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    await fetch(`${supabaseUrl}/rest/v1/content_archetypes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        function_name: functionName,
        archetype_key: archetypeKey,
        tone_profile: toneProfile,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch {
    // non-fatal
  }
}

// ─── Public API ─────────────────────────────────────────────────────────

export async function pickArchetype(functionName: string): Promise<ArchetypeSet> {
  const pool = ARCHETYPE_POOLS[functionName] || COMIC_ARCHETYPES;
  const recentKeys = await getRecentArchetypeKeys(functionName, Math.min(pool.length - 1, 3));

  const available = pool.filter((a) => !recentKeys.includes(a.archetypeKey));

  // If everything was recently used (unlikely with 6 archetypes), just pick a random one
  const candidates = available.length > 0 ? available : pool;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];

  // Fire-and-forget logging
  logArchetypeUsage(functionName, picked.archetypeKey, picked.toneProfile).catch(() => {});

  return picked;
}

export function toneProfileToPrompt(tp: ToneProfile): string {
  const chaosDesc = tp.chaosLevel >= 0.8 ? '극도로 거칠고 카오틱한' : tp.chaosLevel >= 0.5 ? '적당히 거친' : '차분한';
  const sincerityDesc = tp.sincerityLevel >= 0.8 ? '진정성 있는 공감 모먼트 포함' : tp.sincerityLevel >= 0.4 ? '간헐적 진심' : '유머 위주';
  const cadenceDesc = {
    'rapid-fire': '빠르고 펀치한 리듬',
    'conversational': '대화체 자연스러운 리듬',
    'breathy-pause': '여운 있는 느린 리듬',
    'stream-of-conscious': '의식의 흐름식 자유로운 리듬',
  }[tp.cadence];

  return `\n## 이번 생성의 톤 드리프트 파라미터\n- 혼돈 수준: ${chaosDesc} (혼돈=${tp.chaosLevel})\n- 진정성 수준: ${sincerityDesc} (진정성=${tp.sincerityLevel})\n- 카던스: ${cadenceDesc}\n- 밈 포맷: ${tp.memeFormat}\n이 파라미터에 맞춰 톤과 분위기를 조절하라. 이전 생성과 다른 느낌이어야 한다.\n`;
}
