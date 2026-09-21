import { supabase } from '@/lib/supabase';
import { addCredits } from '@/lib/credits';

export type QuestType = 'daily_publish' | 'weekly_multiplatform' | 'daily_scan' | 'weekly_streak';

export interface Quest {
  id: string;
  quest_type: QuestType;
  title: string;
  description: string;
  reward_credits: number;
  target_count: number;
  current_count: number;
  status: 'active' | 'completed' | 'claimed';
  period_start: string;
  period_end: string;
}

const QUEST_DEFINITIONS: Omit<Quest, 'id' | 'current_count' | 'status' | 'period_start' | 'period_end'>[] = [
  {
    quest_type: 'daily_publish',
    title: '오늘의 숏폼 발행',
    description: '떡상 추천 상품 숏폼 1개 발행하기',
    reward_credits: 50,
    target_count: 1,
  },
  {
    quest_type: 'daily_scan',
    title: '상품 분석 3회',
    description: '오늘 상품 3개 분석하기',
    reward_credits: 30,
    target_count: 3,
  },
  {
    quest_type: 'weekly_multiplatform',
    title: '3플랫폼 동시 발행',
    description: '유튜브/인스타/틱톡에 동시 발행하기',
    reward_credits: 100,
    target_count: 3,
  },
  {
    quest_type: 'weekly_streak',
    title: '일주일 연속 방문',
    description: '7일 연속 앱 접속하기',
    reward_credits: 200,
    target_count: 7,
  },
];

function getDailyPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getWeeklyPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getPeriod(questType: QuestType): { start: string; end: string } {
  return questType.startsWith('weekly') ? getWeeklyPeriod() : getDailyPeriod();
}

export async function getActiveQuests(): Promise<Quest[]> {
  try {
    const now = new Date().toISOString();
    const { data: existing } = await supabase
      .from('daily_quests')
      .select('*')
      .eq('status', 'active')
      .gte('period_end', now)
      .order('created_at', { ascending: true });

    const existingQuests = (existing as Quest[]) ?? [];

    type QuestSeed = Omit<Quest, 'id'>;
    const toCreate: QuestSeed[] = [];
    for (const def of QUEST_DEFINITIONS) {
      const period = getPeriod(def.quest_type);
      const hasCurrent = existingQuests.some(
        (q) => q.quest_type === def.quest_type && q.period_start === period.start,
      );
      if (!hasCurrent) {
        toCreate.push({
          ...def,
          current_count: 0,
          status: 'active' as const,
          period_start: period.start,
          period_end: period.end,
        });
      }
    }

    if (toCreate.length === 0) {
      return existingQuests;
    }

    const { data: created, error } = await supabase
      .from('daily_quests')
      .insert(toCreate)
      .select();

    if (error || !created) return existingQuests;
    return [...existingQuests, ...(created as Quest[])] as Quest[];
  } catch {
    return [];
  }
}

export async function incrementQuestProgress(questType: QuestType, amount: number = 1): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data: quest } = await supabase
        .from('daily_quests')
        .select('*')
        .eq('quest_type', questType)
        .eq('status', 'active')
        .gte('period_end', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!quest) return;

      const newCount = Math.min(quest.current_count + amount, quest.target_count);
      const newStatus = newCount >= quest.target_count ? 'completed' : 'active';

      const { data: updated } = await supabase
        .from('daily_quests')
        .update({ current_count: newCount, status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', quest.id)
        .eq('current_count', quest.current_count)
        .select();

      if (updated && updated.length > 0) return;
    } catch {
      return;
    }
  }
}

export async function claimQuestReward(questId: string): Promise<number> {
  try {
    const { data: updated, error } = await supabase
      .from('daily_quests')
      .update({ status: 'claimed', updated_at: new Date().toISOString() })
      .eq('id', questId)
      .eq('status', 'completed')
      .select();

    if (error || !updated || updated.length === 0) return 0;

    const quest = updated[0] as Quest;
    await addCredits(quest.reward_credits, 'bonus', `퀘스트 보상: ${quest.title}`);
    return quest.reward_credits;
  } catch {
    return 0;
  }
}

export async function getCompletedQuests(): Promise<Quest[]> {
  try {
    const { data } = await supabase
      .from('daily_quests')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: false });
    return (data as Quest[]) ?? [];
  } catch {
    return [];
  }
}
