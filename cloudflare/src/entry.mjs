import { DurableObject } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';
import { createServer } from 'node:http';
import * as gax from '../../server/node_modules/google-gax/build/src/fallback.js';
import { FirestoreClient } from '../../server/node_modules/@google-cloud/firestore-api/build/src/v1/firestore_client.js';
import loadGateway from './gateway.cjs';
// Dependencies that create SDK/deprecation wrappers with new Function must be
// loaded during startup, before application initialization inside the object.
import '../../server/node_modules/express/index.js';
import '../../server/node_modules/express-session/index.js';
import '../../server/node_modules/cors/lib/index.js';
import '../../server/node_modules/firebase-admin/lib/app/index.js';
import '../../server/node_modules/firebase-admin/lib/auth/index.js';
import '../../server/node_modules/firebase-admin/lib/firestore/index.js';
import taskService from '../../server/services/durableRuntimeTasks.js';
import security from '../../server/services/httpSecurityHeaders.js';
import background from '../../server/services/backgroundTasks.js';
import { isGatewayPath, trustedProxyRequest, preflightRejection } from './routing.mjs';

// protobufjs generates its SDK-owned serialization functions lazily. Workers
// permits this during startup only. Precompile descriptors, never record data.
new FirestoreClient({ projectId: 'startup-descriptors-only', fallback: 'rest' }, gax);
function prepare(node) {
  if (typeof node.setup === 'function') node.setup();
  for (const child of Object.values(node.nested || {})) prepare(child);
}
for (const root of gax.GrpcClient.protoCache.values()) { root.resolveAll(); prepare(root); }

export class HugpongGateway extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    const gateway = loadGateway();
    if (!['preflight', 'active'].includes(env.GATEWAY_MODE)) throw new Error('GATEWAY_MODE must be preflight or active.');
    this.preflight = env.GATEWAY_MODE === 'preflight';
    this.tasks = this.preflight ? null : taskService.createDurableRuntimeTasks(gateway.db, ctx.storage);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      if (!gateway.db) throw new Error('The Firebase gateway is not configured.');
      await gateway.changeFeed.hydrate();
      if (this.tasks) await this.tasks.initialize();
      else await ctx.storage.deleteAlarm();
      this.http = httpServerHandler(createServer(gateway.app));
      if (!this.preflight) gateway.runtimeLifecycle.markReady();
    });
  }

  async fetch(request) {
    await this.ready;
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const rejection = preflightRejection(request, this.env.GATEWAY_MODE);
    if (rejection) return rejection;
    // Arm before the canonical mutation. A process failure cannot depend on an
    // in-memory setTimeout to rediscover the durable notification intent.
    if (mutation) await this.tasks.wake(60000);
    try {
      const response = await background.runWithBackgroundTasks(promise => this.ctx.waitUntil(promise),
        () => this.http.fetch(request, this.env, this.ctx));
      response.headers.set('X-Hugpong-Gateway-Mode', this.preflight ? 'preflight' : 'active');
      return response;
    } finally {
      if (mutation) this.ctx.waitUntil(this.tasks.wake());
    }
  }

  async alarm() {
    await this.ready;
    if (this.tasks) await this.tasks.drain();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.hugpong.org') {
      url.hostname = 'hugpong.org';
      return Response.redirect(url.toString(), 308);
    }
    if (!isGatewayPath(url.pathname)) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(security.httpSecurityHeaders(true))) headers.set(name, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    // One named object is the ONLY API authority. Never shard by user/device;
    // all authorized Web/Android streams must observe the same commit feed.
    return env.GATEWAY.getByName('hugpong-canonical-api-v1').fetch(trustedProxyRequest(request));
  }
};
