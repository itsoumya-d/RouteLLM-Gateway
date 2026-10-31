// SPDX-License-Identifier: MIT
// OpenAI-compatible and Anthropic-compatible HTTP/SSE surface.

import http from "node:http";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > 1024 * 1024) { reject(new Error("body too large")); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(payload) });
  res.end(payload);
}

export function startGateway({ gateway, host = "127.0.0.1", port = 8788 }) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, name: "route-gateway", version: "0.1.0" });
    }
    if (req.method === "GET" && req.url === "/metrics") {
      return json(res, 200, { cache: gateway.cache?.stats ?? null });
    }
    if (req.method !== "POST") return json(res, 404, { error: "not found" });

    let body;
    try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: "invalid JSON" }); }

    if (req.url === "/v1/chat/completions") {
      if (body.stream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        for await (const chunk of gateway.stream(body)) {
          if (chunk.type === "delta") {
            res.write(`data: ${JSON.stringify({ id: body.id ?? "chatcmpl", object: "chat.completion.chunk", choices: [{ delta: { content: chunk.content } }] })}\n\n`);
          } else {
            res.write(`data: ${JSON.stringify({ id: body.id ?? "chatcmpl", object: "chat.completion.chunk", choices: [{ delta: {}, finish_reason: "stop" }], usage: chunk.response.usage, routing: chunk.response.routing })}\n\n`);
            res.write("data: [DONE]\n\n");
          }
        }
        res.end();
        return;
      }
      return json(res, 200, await gateway.handle(body));
    }

    if (req.url === "/v1/messages") {
      const request = {
        id: body.id,
        messages: [{ role: "user", content: body.messages?.map((m) => m.content).join("\n") ?? "" }],
        response_format: body.response_format,
      };
      const result = await gateway.handle(request);
      return json(res, 200, {
        id: body.id ?? "msg",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: result.choices[0].message.content }],
        model: result.model,
        usage: result.usage,
        routing: result.routing,
        cached: result.cached,
      });
    }

    return json(res, 404, { error: "not found" });
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const address = server.address();
      resolve({ server, url: `http://${address.address}:${address.port}`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}
