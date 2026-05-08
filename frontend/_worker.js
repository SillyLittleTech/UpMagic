// worker/src/index.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Debug endpoint to inspect runtime bindings
    if (pathname === '/__bindings') {
      const bindings = {
        ASSETS_available: !!(env && env.ASSETS && typeof env.ASSETS.fetch === 'function'),
        STATUS_KV_bound: !!env.STATUS_KV,
        GITHUB_GIST_ID: !!env.GITHUB_GIST_ID,
        ISSUES_PAT: !!env.ISSUES_PAT
      };
      return new Response(JSON.stringify(bindings, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }

    if (pathname === '/api/status') {
      const state = await env.STATUS_KV.get('current_state');
      return new Response(state || JSON.stringify({ services: {}, incidents: [], maintenance: [], historyByService: {} }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Admin APIs
    if (pathname.startsWith('/api/admin/')) {
      if (request.method === 'POST') {
        const body = await request.json();
        
        if (pathname === '/api/admin/update_service') {
          // Expect { serviceId: string, status: string }
          let state = await env.STATUS_KV.get('current_state', 'json') || { services: {}, incidents: [], maintenance: [], historyByService: {} };
          if (!state.services) state.services = {};
          if (!state.historyByService) state.historyByService = {};
          
          const targetsMap = {
            'slt_main': 'SillyLittle.tech',
            'slt_socks': 'Socks (SLT)',
            'slt_projects': 'Projects (SLT)',
            'hotlinks': 'HotLinks (share.sillylittle.tech)'
          };
          const existingName = state.services[body.serviceId]?.name || targetsMap[body.serviceId] || body.serviceId;
          
          state.services[body.serviceId] = {
            name: existingName,
            status: body.status,
            lastUpdated: Date.now(),
            isManual: body.status !== 'Auto',
            latency: null
          };
          
          // If returning to auto, let heartbeat pick it up, or just clear isManual
          if (body.status === 'Auto') {
             state.services[body.serviceId].isManual = false;
             // Temporarily set to pending check
             state.services[body.serviceId].status = 'Pending Check';
             state.services[body.serviceId].latency = null;
             await saveState(env, state); // Save immediately so the frontend sees Pending Check
             ctx.waitUntil(runHeartbeat(env)); // Run heartbeat asynchronously to update actual status
             return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }});
          }

          await saveState(env, state);
          return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }});
        }
        
        if (pathname === '/api/admin/incident') {
          // Expect { title: string, description: string, status: string }
          let state = await env.STATUS_KV.get('current_state', 'json') || { services: {}, incidents: [], maintenance: [], historyByService: {} };
          if (!state.incidents) state.incidents = [];

          state.incidents.unshift({
            id: Date.now().toString(),
            title: body.title,
            description: body.description,
            status: body.status,
            createdAt: Date.now()
          });
          await saveState(env, state);
          return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders }});
        }
      }
    }

    // Fallback to static assets — guard in case ASSETS isn't bound so we don't throw.
    if (env && env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }

    // If ASSETS is missing (deployment/config issue), return a small friendly page
    // instead of throwing so the admin APIs still work and logs are clearer.
    const fallbackHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Static assets unavailable</title></head><body><h1>Static assets unavailable</h1><p>The Worker runtime does not have an <code>ASSETS</code> binding. Check your Pages/Workers configuration.</p><p>Visit <a href="/__bindings">/__bindings</a> to inspect runtime bindings.</p></body></html>`;
    return new Response(fallbackHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 500 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runHeartbeat(env));
  }
};

async function runHeartbeat(env) {
  const targets = [
    { id: 'slt_main', url: 'https://sillylittle.tech', name: 'SillyLittle.tech' },
    { id: 'slt_socks', url: 'https://socks.sillylittle.tech', name: 'Socks (SLT)' },
    { id: 'slt_projects', url: 'https://projects.sillylittle.tech', name: 'Projects (SLT)' },
    { id: 'hotlinks', url: 'https://share.sillylittle.tech/heartbeat', name: 'HotLinks (share.sillylittle.tech)' }
  ];

  let state = await env.STATUS_KV.get('current_state', 'json');
  if (!state) state = { services: {}, incidents: [], maintenance: [], historyByService: {} };
  if (!state.services) state.services = {};
  if (!state.historyByService) state.historyByService = {};

  let statusChanged = false;
  let notifications = [];
  const heartbeatAt = Date.now();

  for (const target of targets) {
    if (state.services[target.id]?.isManual) {
      continue; 
    }

    let isUp = false;
    let latency = null;
    try {
      const start = Date.now();
      const res = await fetch(target.url, { method: 'GET', redirect: 'manual', headers: {'User-Agent': 'SLT-Status-Worker'} });
      const measuredLatency = Date.now() - start;
      if (res.status === 301) {
        isUp = true;
        latency = measuredLatency;
      }
    } catch (e) {
      isUp = false;
    }

    const newStatus = isUp ? 'Operational' : 'Down';
    const oldStatus = state.services[target.id]?.status;

    if (oldStatus !== newStatus && oldStatus !== 'Pending Check') {
      statusChanged = true;
      if (oldStatus) {
        notifications.push(`${target.name} transitioned from ${oldStatus} to ${newStatus}. Latency: ${latency}ms`);
      }
    }

    state.services[target.id] = {
      name: target.name,
      status: newStatus,
      lastUpdated: heartbeatAt,
      latency: latency,
      isManual: false
    };

    appendServiceHistory(state, target.id, {
      timestamp: heartbeatAt,
      status: newStatus,
      latency: latency
    });
  }

  // Fetch maintained issues from ProjectHub
  try {
    const issuesRes = await fetch('https://api.github.com/repos/SillyLittleTech/projecthub/issues?labels=maintain&state=open', {
      headers: {
        'User-Agent': 'SLT-Status-Worker',
        'Authorization': env.ISSUES_PAT ? `Bearer ${env.ISSUES_PAT}` : ''
      }
    });
    if (issuesRes.ok) {
      const issues = await issuesRes.json();
      state.maintenance = issues.map(i => ({ title: i.title, url: i.html_url, created_at: i.created_at }));
    }
  } catch (e) {
    console.error('Failed to fetch maintenance issues', e);
  }

  // Webhooks are skipped for now per request
  /*
  if (statusChanged) {
    for (const msg of notifications) {
      await sendWebhook(env.NOTIFY_WEBHOOK_URL, msg);
    }
  }
  */

  await saveState(env, state);
}

async function saveState(env, state) {
  // Save to KV
  if (env.STATUS_KV) {
     await env.STATUS_KV.put('current_state', JSON.stringify(state));
  }

  // Double-write to GitHub Gist
  if (env.GITHUB_GIST_ID && env.ISSUES_PAT) {
    try {
      await fetch(`https://api.github.com/gists/${env.GITHUB_GIST_ID}`, {
        method: 'PATCH',
        headers: {
          'User-Agent': 'SLT-Status-Worker',
          'Authorization': `Bearer ${env.ISSUES_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: {
            'status.json': {
              content: JSON.stringify(state, null, 2)
            }
          }
        })
      });
    } catch (e) {
      console.error('Failed to update GitHub Gist', e);
    }
  }
}

function appendServiceHistory(state, serviceId, entry) {
  if (!state.historyByService) state.historyByService = {};
  if (!Array.isArray(state.historyByService[serviceId])) {
    state.historyByService[serviceId] = [];
  }

  state.historyByService[serviceId].push(entry);

  // Keep roughly one day of minute heartbeats.
  if (state.historyByService[serviceId].length > 1440) {
    state.historyByService[serviceId] = state.historyByService[serviceId].slice(-1440);
  }
}

async function sendWebhook(url, message) {
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `**Status Update:** ${message}` })
    });
  } catch(e) {}
}