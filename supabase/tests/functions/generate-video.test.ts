// deno-lint-ignore-file no-explicit-any
/**
 * Tests for the generate-video edge function.
 *
 * Since the edge function runs in Deno and uses Deno.serve + fetch to
 * external APIs, we mock the Deno globals and global fetch to test the
 * request/response routing logic in isolation.
 */

// Provide Deno globals before importing the module
(global as any).Deno = {
  env: {
    get(key: string): string | undefined {
      return (global as any).__DENO_ENV__?.[key];
    },
  },
  serve(handler: (req: Request) => Promise<Response>): void {
    (global as any).__DENO_HANDLER__ = handler;
  },
};

// We need to mock fetch before importing the module
const originalFetch = global.fetch;

// Helper to create a JSON Response
function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('generate-video edge function', () => {
  let handler: (req: Request) => Promise<Response>;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.resetModules();

    (global as any).__DENO_ENV__ = {
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      RUNWAY_API_KEY: 'test-runway-key',
    };

    mockFetch = jest.fn();
    (global as any).fetch = mockFetch;

    // Import the module — this triggers Deno.serve which captures the handler
    jest.isolateModules(() => {
      // The module uses `import "jsr:@supabase/functions-js/edge-runtime.d.ts"`
      // which is mapped to an empty module via jest moduleNameMapper
      try {
        require('../../functions/generate-video/index.ts');
      } catch {
        // TypeScript require may fail in Jest without ts transform for .ts
        // We handle this by using a dynamic approach below
      }
    });

    handler = (global as any).__DENO_HANDLER__;
  });

  afterEach(() => {
    (global as any).fetch = originalFetch;
    (global as any).__DENO_HANDLER__ = undefined;
    jest.restoreAllMocks();
  });

  describe('CORS and method handling', () => {
    it('responds to OPTIONS with 200 and CORS headers', async () => {
      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'OPTIONS',
      });
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(resp.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('rejects GET with 405', async () => {
      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'GET',
      });
      const resp = await handler(req);
      expect(resp.status).toBe(405);
      const body = await resp.json();
      expect(body.error).toBeDefined();
    });
  });

  describe('poll mode', () => {
    it('returns 400 when taskId is missing', async () => {
      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'poll' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain('taskId');
    });

    it('returns SUCCESS when Runway poll succeeds', async () => {
      // Mock: resolveRunwayKey fetch (user_settings), checkWebhookResult, checkVideoJobStatus, pollRunwayTask
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/rest/v1/user_settings')) {
          return Promise.resolve(jsonResponse([{ runway_api_key: 'user-key' }]));
        }
        if (url.includes('/rest/v1/scans?select=video_url')) {
          return Promise.resolve(jsonResponse([{ video_url: null }]));
        }
        if (url.includes('/rest/v1/video_jobs')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('api.dev.runwayml.com/v1/tasks/')) {
          return Promise.resolve(jsonResponse({
            status: 'SUCCEEDED',
            output: ['https://cdn.runway.com/video.mp4'],
          }));
        }
        if (url.includes('/storage/v1/object/videos/')) {
          return Promise.resolve(jsonResponse({}, 200));
        }
        if (url.includes('/rest/v1/scans?id=eq.')) {
          return Promise.resolve(jsonResponse({}, 200));
        }
        return Promise.resolve(jsonResponse({}, 404));
      });

      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'poll', taskId: 'task-123', scanId: 'scan-456' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('SUCCESS');
      expect(body.videoUrl).toBeDefined();
    });

    it('returns FAILED when Runway reports failure', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/rest/v1/user_settings')) {
          return Promise.resolve(jsonResponse([{ runway_api_key: 'user-key' }]));
        }
        if (url.includes('/rest/v1/scans?select=video_url')) {
          return Promise.resolve(jsonResponse([{ video_url: null }]));
        }
        if (url.includes('/rest/v1/video_jobs')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('api.dev.runwayml.com/v1/tasks/')) {
          return Promise.resolve(jsonResponse({
            status: 'FAILED',
            failure: 'GPU out of memory',
          }));
        }
        return Promise.resolve(jsonResponse({}, 404));
      });

      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'poll', taskId: 'task-123' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('FAILED');
      expect(body.error).toContain('GPU out of memory');
    });

    it('returns PROCESSING when Runway task is still running', async () => {
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/rest/v1/user_settings')) {
          return Promise.resolve(jsonResponse([{ runway_api_key: 'user-key' }]));
        }
        if (url.includes('/rest/v1/scans?select=video_url')) {
          return Promise.resolve(jsonResponse([{ video_url: null }]));
        }
        if (url.includes('/rest/v1/video_jobs')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('api.dev.runwayml.com/v1/tasks/')) {
          return Promise.resolve(jsonResponse({
            status: 'RUNNING',
            progress: '0.45',
          }));
        }
        return Promise.resolve(jsonResponse({}, 404));
      });

      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'poll', taskId: 'task-123' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('RUNNING');
      expect(body.progress).toBe('0.45');
    });

    it('retries on transient 503 then succeeds', async () => {
      let pollCallCount = 0;
      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/rest/v1/user_settings')) {
          return Promise.resolve(jsonResponse([{ runway_api_key: 'user-key' }]));
        }
        if (url.includes('/rest/v1/scans?select=video_url')) {
          return Promise.resolve(jsonResponse([{ video_url: null }]));
        }
        if (url.includes('/rest/v1/video_jobs')) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.includes('api.dev.runwayml.com/v1/tasks/')) {
          pollCallCount++;
          if (pollCallCount === 1) {
            return Promise.resolve(jsonResponse({ error: 'Service Unavailable' }, 503));
          }
          return Promise.resolve(jsonResponse({
            status: 'SUCCEEDED',
            output: ['https://cdn.runway.com/video.mp4'],
          }));
        }
        if (url.includes('/storage/v1/object/videos/')) {
          return Promise.resolve(jsonResponse({}, 200));
        }
        if (url.includes('/rest/v1/scans?id=eq.')) {
          return Promise.resolve(jsonResponse({}, 200));
        }
        return Promise.resolve(jsonResponse({}, 200));
      });

      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'poll', taskId: 'task-123', scanId: 'scan-456' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('SUCCESS');
      expect(pollCallCount).toBe(2);
    });
  });

  describe('webhook mode', () => {
    it('processes SUCCESS webhook and persists video', async () => {
      mockFetch.mockImplementation((url: string, opts?: any) => {
        if (url.includes('/rest/v1/video_jobs') && opts?.method === 'PATCH') {
          return Promise.resolve(jsonResponse({}, 200));
        }
        if (url.includes('/storage/v1/object/videos/')) {
          return Promise.resolve(jsonResponse({}, 200));
        }
        if (url.includes('/rest/v1/scans?id=eq.')) {
          return Promise.resolve(jsonResponse({}, 200));
        }
        if (url.includes('/rest/v1/scans?select=user_id')) {
          return Promise.resolve(jsonResponse([{ user_id: 'user-1' }]));
        }
        if (url.includes('/functions/v1/send-push')) {
          return Promise.resolve(jsonResponse({}, 200));
        }
        if (url.includes('/rest/v1/video_jobs') && url.includes('select=')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse({}, 200));
      });

      const req = new Request(
        'https://test.supabase.co/functions/v1/generate-video?mode=webhook&taskId=task-789&scanId=scan-789',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'SUCCESS',
            output: ['https://cdn.runway.com/result.mp4'],
          }),
        },
      );
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.mode).toBe('webhook');
      expect(body.status).toBe('SUCCESS');
    });

    it('returns 400 when taskId is missing from webhook', async () => {
      const req = new Request(
        'https://test.supabase.co/functions/v1/generate-video?mode=webhook',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SUCCESS' }),
        },
      );
      const resp = await handler(req);
      expect(resp.status).toBe(400);
    });

    it('processes FAILED webhook', async () => {
      mockFetch.mockImplementation((url: string, opts?: any) => {
        if (url.includes('/rest/v1/video_jobs') && opts?.method === 'PATCH') {
          return Promise.resolve(jsonResponse({}, 200));
        }
        if (url.includes('/rest/v1/video_jobs') && url.includes('select=')) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(jsonResponse({}, 200));
      });

      const req = new Request(
        'https://test.supabase.co/functions/v1/generate-video?mode=webhook&taskId=t1&scanId=s1',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'FAILED', failure: 'render error' }),
        },
      );
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('FAILED');
      expect(body.error).toContain('render error');
    });

    it('skips duplicate SUCCESS webhook when job already completed', async () => {
      mockFetch.mockImplementation((url: string, opts?: any) => {
        // findJobByRunwayTaskId returns a SUCCESS row
        if (url.includes('/rest/v1/video_jobs') && url.includes('runway_task_id=eq.') && url.includes('select=')) {
          return Promise.resolve(jsonResponse([{
            status: 'SUCCESS',
            error_message: null,
            video_url: 'https://test.supabase.co/storage/v1/object/videos/existing.mp4',
            task_id: 'internal-job-1',
            created_at: new Date().toISOString(),
          }]));
        }
        return Promise.resolve(jsonResponse({}, 200));
      });

      const req = new Request(
        'https://test.supabase.co/functions/v1/generate-video?mode=webhook&taskId=runway-1&scanId=scan-1',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SUCCESS', output: ['https://cdn.runway.com/new.mp4'] }),
        },
      );
      const resp = await handler(req);
      expect(resp.status).toBe(200);
      const body = await resp.json();
      expect(body.status).toBe('SUCCESS');
      expect(body.alreadyCompleted).toBe(true);
    });
  });

  describe('key resolution', () => {
    it('returns 503 when no Runway API key is configured for poll mode', async () => {
      (global as any).__DENO_ENV__ = {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      };

      mockFetch.mockImplementation((url: string) => {
        if (url.includes('/rest/v1/user_settings')) {
          return Promise.resolve(jsonResponse([{ runway_api_key: null }]));
        }
        return Promise.resolve(jsonResponse({}, 404));
      });

      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'poll', taskId: 'task-123' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(503);
      const body = await resp.json();
      expect(body.error).toContain('Runway API 키');
    });
  });

  describe('submit mode (async)', () => {
    it('returns 202 immediately with taskId and PENDING status', async () => {
      mockFetch.mockImplementation((url: string, opts?: any) => {
        if (url.includes('/rest/v1/rpc/check_rate_limit')) {
          return Promise.resolve(jsonResponse(true));
        }
        if (url.includes('/rest/v1/video_jobs') && opts?.method === 'POST') {
          return Promise.resolve(jsonResponse({}, 201));
        }
        // self-invoke runway-submit — mock as success
        if (url.includes('/functions/v1/generate-video') && opts?.method === 'POST') {
          const body = JSON.parse(opts.body);
          if (body.mode === 'runway-submit') {
            return Promise.resolve(jsonResponse({ mode: 'runway-submit', status: 'SUBMITTED' }));
          }
        }
        return Promise.resolve(jsonResponse({}, 200));
      });

      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'submit', prompt: 'test', scanId: 'scan-123' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(202);
      const body = await resp.json();
      expect(body.taskId).toBeDefined();
      expect(body.status).toBe('PENDING');
      expect(body.provider).toBe('runway');
    });
  });

  describe('input validation', () => {
    it('returns 400 when submit payload has no prompt, scanId, or productName', async () => {
      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid_payload: true }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toBeDefined();
    });

    it('returns 400 for unsupported mode', async () => {
      const req = new Request('https://test.supabase.co/functions/v1/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'invalid-mode' }),
      });
      const resp = await handler(req);
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain('지원하지 않는 모드');
    });
  });
});
