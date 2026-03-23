# ADR-002: SSE vs WebSocket for LLM Response Streaming

## Status

**Accepted** — 2025-07-20

## Context

ModularMind needs to stream LLM responses to the client in real-time. Users expect to see tokens appear progressively as the model generates them, similar to ChatGPT and Claude interfaces. We need to choose between Server-Sent Events (SSE) and WebSocket for this streaming mechanism.

## Decision Drivers

1. **Unidirectional nature**: LLM streaming is server-to-client only
2. **HTTP/2 compatibility**: Modern infrastructure expects HTTP-based protocols
3. **Infrastructure simplicity**: Reverse proxies, load balancers, CDN compatibility
4. **Reconnection handling**: Graceful recovery from network interruptions
5. **Browser support**: Universal browser compatibility without polyfills

## Options Considered

### Option A: WebSocket

**Pros:**
- Full-duplex communication
- Lower per-message overhead after handshake
- Well-suited for bidirectional real-time apps (chat, gaming)
- Rich ecosystem (Socket.IO, ws library)

**Cons:**
- Requires connection upgrade (HTTP → WS protocol)
- Many reverse proxies need special configuration for WS
- Load balancers must support sticky sessions or WS-aware routing
- No built-in reconnection (must implement manually)
- CORS handling is different from standard HTTP
- Nginx requires explicit `proxy_set_header Upgrade` configuration
- AWS ALB WebSocket connections have 10-minute idle timeout
- Not cacheable, not compressible by default

### Option B: Server-Sent Events (SSE)

**Pros:**
- Standard HTTP — works through any reverse proxy, CDN, load balancer
- Built-in automatic reconnection with `Last-Event-ID`
- Native `EventSource` API in all browsers
- Simple server implementation (just `text/event-stream` content type)
- HTTP/2 multiplexing eliminates the 6-connection browser limit
- Easy to debug with curl or browser DevTools
- Compatible with standard HTTP authentication (cookies)
- Works through corporate proxies and firewalls

**Cons:**
- Unidirectional only (server → client)
- Text-only protocol (binary data needs Base64)
- Maximum 6 connections per domain on HTTP/1.1 (not an issue with HTTP/2)
- No native support in some HTTP clients (mitigated by simple parsing)

## Decision

**We chose Option B: Server-Sent Events (SSE).**

The streaming use case is fundamentally unidirectional — the server streams tokens to the client. User messages are sent via standard POST requests. WebSocket's full-duplex capability adds complexity without providing value for this use case.

The infrastructure benefits are decisive:
- SSE works through standard Nginx `proxy_pass` without special configuration
- No sticky sessions needed for load balancing
- Standard HTTP cookies (`withCredentials: true`) handle authentication seamlessly
- Corporate firewalls and proxies that block WebSocket connections work fine with SSE

## Implementation

### Server Side (FastAPI)

```python
from fastapi.responses import StreamingResponse

@router.get("/conversations/{conv_id}/messages/stream")
async def stream_response(conv_id: str, content: str):
    async def event_generator():
        yield f"event: message_start\ndata: {json.dumps({'id': msg_id})}\n\n"

        async for token in llm.stream(messages):
            yield f"event: content_delta\ndata: {json.dumps({'delta': token})}\n\n"

        yield f"event: message_end\ndata: {json.dumps({'tokens': count})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable Nginx buffering
        },
    )
```

### Client Side (React)

```typescript
const eventSource = new EventSource(
  `${API_URL}/conversations/${convId}/messages/stream?content=${encoded}`,
  { withCredentials: true }
);

eventSource.addEventListener('content_delta', (e) => {
  const { delta } = JSON.parse(e.data);
  setMessage(prev => prev + delta);
});

eventSource.addEventListener('message_end', () => {
  eventSource.close();
});
```

### Nginx Configuration

```nginx
location /api/ {
    proxy_pass http://engine:8000;
    proxy_buffering off;           # Critical for SSE
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
}
```

## Consequences

### Positive
- Zero infrastructure changes needed (standard HTTP everywhere)
- Reconnection is automatic via EventSource API
- Authentication works via existing cookie mechanism
- Debugging is trivial (curl, browser DevTools Network tab)
- Latency is comparable to WebSocket for our use case

### Negative
- Cannot push server events without an active SSE connection (not needed for our use case)
- Binary data (images, files) cannot be streamed directly via SSE (handled via separate endpoints)

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [EventSource API specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [HTTP/2 and SSE](https://www.smashingmagazine.com/2018/02/sse-websockets-data-flow-http2/)
