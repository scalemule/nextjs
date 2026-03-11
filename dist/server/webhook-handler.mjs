import { createHmac, timingSafeEqual } from 'crypto';

// src/server/webhooks.ts
function verifyWebhookSignature(payload, signature, secret) {
  if (!signature.startsWith("sha256=")) {
    return false;
  }
  const providedSig = signature.slice(7);
  const expectedSig = createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(
      Buffer.from(providedSig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    return false;
  }
}
function parseWebhookEvent(payload) {
  return JSON.parse(payload);
}

// src/server/webhook-handler.ts
function createWebhookHandler(config = {}) {
  return async (request) => {
    const signature = request.headers.get("x-webhook-signature");
    const body = await request.text();
    if (config.secret) {
      if (!signature || !verifyWebhookSignature(body, signature, config.secret)) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    try {
      const event = parseWebhookEvent(body);
      if (config.onEvent && event.event && config.onEvent[event.event]) {
        await config.onEvent[event.event](event);
      }
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: "Webhook processing failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  };
}

export { createWebhookHandler };
