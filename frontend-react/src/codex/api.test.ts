import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, clearAccess, createSseDecoder, readCapabilities, streamEvents } from './api'
import type { StreamEvent } from './types'
afterEach(() => {
  clearAccess()
  vi.unstubAllGlobals()
})
describe('Codex authenticated transport', () => {
  it('maps server model capabilities without inventing image or reasoning support', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string) => {
        if (path.endsWith('/bootstrap'))
          return Response.json({
            token: 'capability-token',
            expiresAt: new Date(Date.now() + 60000).toISOString(),
          })
        if (path.endsWith('/capabilities') && !path.includes('/agents/'))
          return Response.json({ title: 'Not found' }, { status: 404 })
        return Response.json({
          models: [
            {
              id: 'local-vision',
              name: '本机视觉模型',
              provider: 'openai',
              supportsImages: true,
              configured: true,
              reasoningEfforts: ['low', 'high'],
            },
          ],
          voice: { transcription: 'browser' },
        })
      }),
    )
    const result = await readCapabilities()
    expect(result.models[0]?.vision).toBe(true)
    expect(result.models[0]?.audio).toBe(false)
    expect(result.models[0]?.reasoningEfforts).toEqual(['low', 'high'])
  })
  it('decodes fragmented UTF-8 SSE, CRLF, comments and multiline JSON without dispatching keepalives', () => {
    const events: StreamEvent[] = []
    const parse = createSseDecoder((event) => events.push(event))
    parse(': keepalive\r')
    parse(
      '\n\r\nid: 41\r\nevent: message\r\ndata: {"type":\r\ndata: "TEXT_MESSAGE_CONTENT", "delta":"老大"}\r',
    )
    parse('\n\r\nid: 42\ndata: {"type":"RUN_FINISHED"}\n\n')
    expect(events).toEqual([
      { id: '41', event: 'message', data: { type: 'TEXT_MESSAGE_CONTENT', delta: '老大' } },
      { id: '42', event: undefined, data: { type: 'RUN_FINISHED' } },
    ])
  })
  it('refreshes an expired bearer once and preserves the command idempotency body', async () => {
    let bootstrap = 0
    const bodies: string[] = []
    const fetch = vi.fn(async (path: string, init: RequestInit) => {
      if (path.endsWith('/bootstrap'))
        return Response.json({
          token: `token-${++bootstrap}`,
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        })
      const headers = new Headers(init.headers)
      bodies.push(String(init.body))
      if (headers.get('Authorization') === 'Bearer token-1')
        return Response.json({ title: 'Unauthorized' }, { status: 401 })
      expect(headers.get('Authorization')).toBe('Bearer token-2')
      return Response.json({ accepted: true })
    })
    vi.stubGlobal('fetch', fetch)
    expect(
      await api('/conversations/c/runs', 'POST', { clientRequestId: 'stable-id', text: 'test' }),
    ).toEqual({ accepted: true })
    expect(bootstrap).toBe(2)
    expect(bodies[0]).toBe(bodies[1])
  })
  it('uses fetch with bearer and only consumes the existing event stream', async () => {
    const encoder = new TextEncoder()
    const data = encoder.encode('id: 8\ndata: {"type":"TEXT_MESSAGE_CONTENT","delta":"芽"}\n\n')
    const fetch = vi.fn(async (path: string, init: RequestInit) => {
      if (path.endsWith('/bootstrap'))
        return Response.json({
          token: 'events-token',
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        })
      expect(path).toBe('/api/v1/conversations/c/events?after=7')
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer events-token')
      return new Response(
        new ReadableStream({
          start(controller) {
            for (const byte of data) controller.enqueue(new Uint8Array([byte]))
            controller.close()
          },
        }),
      )
    })
    vi.stubGlobal('fetch', fetch)
    const events: StreamEvent[] = []
    await streamEvents('/conversations/c/events?after=7', new AbortController().signal, (event) =>
      events.push(event),
    )
    expect(events[0]?.data.delta).toBe('芽')
    expect(fetch.mock.calls.some(([path]) => path.endsWith('/runs'))).toBe(false)
  })
})
