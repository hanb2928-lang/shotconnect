/**
 * Hybrid AI Model Router — all tasks pinned to gpt-4o-mini for maximum cost savings.
 *
 * Complexity classification is retained for cache-key granularity and token limits,
 * but every task routes to gpt-4o-mini (~95% cheaper than gpt-4o).
 */

export type AiComplexity = 'simple' | 'complex';

export interface ModelRoute {
  model: string;
  complexity: AiComplexity;
  maxTokens: number;
  estimatedCostSavings: number;
}

const SIMPLE_TASKS = new Set([
  'hashtag',
  'keyword',
  'tag',
  'category',
  'price',
  'ocr',
  'extract',
  'meta',
  'product-info',
]);

const COMPLEX_TASKS = new Set([
  'localize',
  'translate',
  'comic',
  'scenario',
  'creative',
  'review',
  'persona',
  'viral-predict',
  'trend-match',
]);

export function classifyComplexity(
  taskType: string,
  inputLength: number,
  options?: { forceComplex?: boolean },
): AiComplexity {
  if (options?.forceComplex) return 'complex';

  const task = taskType.toLowerCase();

  // Explicit simple tasks
  for (const simple of SIMPLE_TASKS) {
    if (task.includes(simple)) return 'simple';
  }

  // Explicit complex tasks
  for (const complex of COMPLEX_TASKS) {
    if (task.includes(complex)) return 'complex';
  }

  // Heuristic: short inputs with simple structure → simple
  if (inputLength < 200 && !task.includes('copy') && !task.includes('caption')) {
    return 'simple';
  }

  // Default: copy generation and caption writing with rich context → complex
  if (task.includes('copy') || task.includes('caption') || task.includes('review')) {
    return inputLength > 500 ? 'complex' : 'simple';
  }

  return 'simple';
}

export function routeModel(complexity: AiComplexity): ModelRoute {
  // All tasks pinned to gpt-4o-mini for maximum cost efficiency.
  // Complexity is still tracked for token-limit and cache-key purposes.
  if (complexity === 'complex') {
    return {
      model: 'gpt-4o-mini',
      complexity: 'complex',
      maxTokens: 2000,
      estimatedCostSavings: 0.95,
    };
  }

  return {
    model: 'gpt-4o-mini',
    complexity: 'simple',
    maxTokens: 1000,
    estimatedCostSavings: 0.95,
  };
}

export function pickModel(
  taskType: string,
  inputText: string,
  options?: { forceComplex?: boolean },
): ModelRoute {
  const complexity = classifyComplexity(taskType, inputText.length, options);
  return routeModel(complexity);
}

/**
 * Generate a content hash for cache keying.
 * Uses a fast polynomial hash — not cryptographic, just for dedup.
 */
export function contentHash(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  const len = input.length;
  const step = Math.max(1, Math.floor(len / 2048));
  for (let i = 0; i < len; i += step) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function buildCacheKey(
  taskType: string,
  input: string,
  extra?: Record<string, string>,
): string {
  const hash = contentHash(input);
  const extraStr = extra
    ? Object.keys(extra).sort().map((k) => `${k}:${extra[k]}`).join('|')
    : '';
  return `${taskType}:${hash}${extraStr ? ':' + extraStr : ''}`;
}
