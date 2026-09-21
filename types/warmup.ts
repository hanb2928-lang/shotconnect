export type WarmupPlatform = 'instagram' | 'tiktok' | 'twitter' | 'blog' | 'pinterest';
export type WarmupTaskType = 'post' | 'engage' | 'follow' | 'comment' | 'like' | 'story';
export type WarmupStatus = 'active' | 'paused' | 'completed';
export type TaskStatus = 'pending' | 'done' | 'skipped';

export interface WarmupSchedule {
  id: string;
  platform: string;
  account_name: string;
  start_date: string;
  duration_days: number;
  daily_post_target: number;
  status: string;
  created_at: string;
}

export interface WarmupTask {
  id: string;
  schedule_id: string;
  day_number: number;
  scheduled_date: string;
  task_type: string;
  title: string;
  description: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
}

export interface WarmupScheduleWithTasks extends WarmupSchedule {
  tasks: WarmupTask[];
  progress: number;
  todayTasks: WarmupTask[];
}

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: '인스타그램',
  tiktok: '틱톡',
  twitter: '트위터/스레드',
  blog: '블로그',
  pinterest: '핀터레스트',
};

export const TASK_TYPE_META: Record<string, { label: string; color: string }> = {
  post: { label: '게시물 업로드', color: '#FF3E3E' },
  story: { label: '스토리/쇼츠', color: '#FF6B9D' },
  engage: { label: '팬 반응', color: '#0064FF' },
  follow: { label: '팔로우', color: '#03C75A' },
  comment: { label: '댓글 작성', color: '#8B5CF6' },
  like: { label: '좋아요', color: '#FFB800' },
};

interface TaskTemplate {
  task_type: WarmupTaskType;
  title: string;
  description: string;
}

const WARMUP_TEMPLATES: Record<number, TaskTemplate[]> = {
  1: [
    { task_type: 'story', title: '스토리로 일상 공유', description: '자연스러운 일상 사진 1-2개를 스토리에 업로드하여 계정이 활성화되었음을 알립니다' },
    { task_type: 'like', title: '관련 계정 10개 좋아요', description: '내 콘텐츠와 비슷한 계정의 최신 게시물 10개에 좋아요를 누릅니다' },
  ],
  2: [
    { task_type: 'story', title: '스토리 1-2개 업로드', description: '제품과 관련된 일상 스토리를 올립니다. 아직 정식 게시물은 올리지 않습니다' },
    { task_type: 'comment', title: '관련 게시물 3개에 댓글', description: '비슷한 주제의 게시물에 자연스러운 댓글을 작성합니다 (2-3문장)' },
    { task_type: 'follow', title: '관련 계정 5개 팔로우', description: '같은 카테고리의 활성 계정 5개를 팔로우하여 관심사를 알립니다' },
  ],
  3: [
    { task_type: 'post', title: '첫 게시물 업로드', description: '앱에서 만든 숏폼 카드로 첫 게시물을 올립니다. 너무 판매적이지 않은 자연스러운 톤으로 작성합니다' },
    { task_type: 'story', title: '스토리로 게시물 공유', description: '업로드한 게시물을 스토리에 다시 공유하여 노출을 높입니다' },
    { task_type: 'engage', title: '팔로워 반응 확인', description: '게시물에 온 반응(좋아요, 댓글)에 모두 답글을 작성합니다' },
  ],
  4: [
    { task_type: 'story', title: '스토리 2개 업로드', description: '하루에 스토리 2개를 자연스럽게 올립니다 (오전/오후)' },
    { task_type: 'like', title: '관련 게시물 15개 좋아요', description: '해시태그로 관련 게시물을 찾아 15개에 좋아요를 누릅니다' },
    { task_type: 'comment', title: '댓글 5개 작성', description: '관련 계정의 게시물에 가치 있는 댓글 5개를 작성합니다' },
  ],
  5: [
    { task_type: 'post', title: '두 번째 게시물', description: '앱에서 만든 캐러셀 카드로 게시물을 올립니다. 후기를 담은 자연스러운 톤이 좋습니다' },
    { task_type: 'engage', title: '모든 반응에 답글', description: '게시물에 온 모든 댓글에 개인화된 답글을 작성합니다' },
    { task_type: 'follow', title: '관련 계정 5개 추가 팔로우', description: '관심사가 겹치는 계정을 추가로 팔로우합니다' },
  ],
  6: [
    { task_type: 'story', title: '스토리로 후기 공유', description: '제품 사용 후기를 스토리로 자연스럽게 올립니다' },
    { task_type: 'like', title: '관련 게시물 20개 좋아요', description: '관련 해시태그 게시물 20개에 좋아요를 눌러 활동을 알립니다' },
  ],
  7: [
    { task_type: 'post', title: '세 번째 게시물', description: '일주일차 게시물을 올립니다. 이제 제품 링크를 자연스럽게 포함합니다' },
    { task_type: 'story', title: '게시물 스토리 공유', description: '업로드한 게시물을 스토리에 공유합니다' },
    { task_type: 'engage', title: '반응에 답글 + 추가 댓글 3개', description: '반응에 답글을 달고, 다른 게시물에도 댓글 3개를 작성합니다' },
  ],
};

const DEFAULT_TEMPLATE: TaskTemplate[] = [
  { task_type: 'post', title: '게시물 업로드', description: '앱에서 만든 카드로 게시물을 업로드합니다' },
  { task_type: 'story', title: '스토리 공유', description: '게시물을 스토리에 공유하여 노출을 높입니다' },
  { task_type: 'engage', title: '반응에 답글', description: '모든 댓글과 좋아요에 답글을 작성합니다' },
  { task_type: 'comment', title: '관련 게시물 댓글 5개', description: '같은 카테고리 게시물에 가치 있는 댓글을 작성합니다' },
  { task_type: 'like', title: '관련 게시물 좋아요 15개', description: '해시태그로 관련 게시물을 찾아 활동합니다' },
];

export function generateTaskTemplates(day: number): TaskTemplate[] {
  return WARMUP_TEMPLATES[day] || DEFAULT_TEMPLATE;
}

export function formatDate(date: Date): string {
  const korea = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return korea.toISOString().split('T')[0];
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function getDayLabel(day: number): string {
  if (day <= 3) return '안정화';
  if (day <= 7) return '기초 체력';
  if (day <= 14) return '본격 활동';
  return '유지';
}

export function getDayColor(day: number): string {
  if (day <= 3) return '#03C75A';
  if (day <= 7) return '#0064FF';
  if (day <= 14) return '#FF3E3E';
  return '#8B5CF6';
}
