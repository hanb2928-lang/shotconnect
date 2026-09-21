import { supabase } from '@/lib/supabase';
import {
  generateTaskTemplates,
  formatDate,
  addDays,
  type WarmupSchedule,
  type WarmupTask,
  type WarmupScheduleWithTasks,
  type WarmupPlatform,
} from '@/types/warmup';

export async function createWarmupSchedule(params: {
  platform: WarmupPlatform;
  account_name: string;
  duration_days: number;
  daily_post_target?: number;
}): Promise<WarmupScheduleWithTasks | null> {
  if (params.duration_days < 1) return null;

  const startDate = new Date();
  const { data: schedule, error } = await supabase
    .from('warmup_schedules')
    .insert({
      platform: params.platform,
      account_name: params.account_name,
      start_date: formatDate(startDate),
      duration_days: params.duration_days,
      daily_post_target: params.daily_post_target ?? 1,
      status: 'active',
    })
    .select()
    .single();

  if (error || !schedule) return null;

  const tasks: Omit<WarmupTask, 'id' | 'created_at'>[] = [];
  for (let day = 1; day <= params.duration_days; day++) {
    const date = addDays(startDate, day - 1);
    const templates = generateTaskTemplates(day);
    for (const t of templates) {
      tasks.push({
        schedule_id: schedule.id,
        day_number: day,
        scheduled_date: formatDate(date),
        task_type: t.task_type,
        title: t.title,
        description: t.description,
        status: 'pending',
        completed_at: null,
      });
    }
  }

  const { data: insertedTasks, error: taskError } = await supabase
    .from('warmup_tasks')
    .insert(tasks)
    .select();

  if (taskError || !insertedTasks) {
    await supabase.from('warmup_schedules').delete().eq('id', schedule.id);
    return null;
  }

  return buildScheduleWithTasks(schedule as WarmupSchedule, insertedTasks as WarmupTask[]);
}

export async function fetchActiveSchedules(): Promise<WarmupScheduleWithTasks[]> {
  try {
    const { data: schedules, error } = await supabase
      .from('warmup_schedules')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('schema cache')) return [];
      return [];
    }

    if (!schedules || schedules.length === 0) return [];

    const scheduleIds = schedules.map((s) => s.id);
    const { data: tasks } = await supabase
      .from('warmup_tasks')
      .select('*')
      .in('schedule_id', scheduleIds)
      .order('scheduled_date', { ascending: true })
      .order('day_number', { ascending: true });

    const tasksBySchedule = new Map<string, WarmupTask[]>();
    for (const t of (tasks ?? []) as WarmupTask[]) {
      const arr = tasksBySchedule.get(t.schedule_id) || [];
      arr.push(t);
      tasksBySchedule.set(t.schedule_id, arr);
    }

    return (schedules as WarmupSchedule[]).map((s) =>
      buildScheduleWithTasks(s, tasksBySchedule.get(s.id) || [])
    );
  } catch {
    return [];
  }
}

export async function updateTaskStatus(
  taskId: string,
  status: 'done' | 'skipped' | 'pending'
): Promise<boolean> {
  const completedAt = status === 'done' ? new Date().toISOString() : null;
  const { error } = await supabase
    .from('warmup_tasks')
    .update({ status, completed_at: completedAt })
    .eq('id', taskId);
  return !error;
}

export async function updateScheduleStatus(
  scheduleId: string,
  status: 'active' | 'paused' | 'completed'
): Promise<boolean> {
  const { error } = await supabase
    .from('warmup_schedules')
    .update({ status })
    .eq('id', scheduleId);
  return !error;
}

export async function deleteSchedule(scheduleId: string): Promise<boolean> {
  await supabase
    .from('warmup_tasks')
    .delete()
    .eq('schedule_id', scheduleId);

  const { error } = await supabase
    .from('warmup_schedules')
    .delete()
    .eq('id', scheduleId);
  return !error;
}

function buildScheduleWithTasks(
  schedule: WarmupSchedule,
  tasks: WarmupTask[]
): WarmupScheduleWithTasks {
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const progress = tasks.length > 0 ? (doneCount / tasks.length) * 100 : 0;
  const today = formatDate(new Date());
  const todayTasks = tasks.filter((t) => t.scheduled_date === today);
  return {
    ...schedule,
    tasks,
    progress,
    todayTasks,
  };
}
