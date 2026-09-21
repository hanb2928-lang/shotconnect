// Mock types for Deno globals used by edge functions
// This file is loaded via Jest setupFiles to provide Deno APIs in Node env

global.Deno = {
  env: {
    get(key: string): string | undefined {
      return (global as any).__DENO_ENV__?.[key];
    },
  },
  serve(handler: (req: Request) => Promise<Response>): { fetch: typeof handler } {
    (global as any).__DENO_HANDLER__ = handler;
    return { fetch: handler };
  },
};
