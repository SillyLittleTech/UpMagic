// During local development (static server on localhost), point API calls to the local Worker.
const WORKER_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://127.0.0.1:8787'
    : '';
const GIST_URL = 'https://gist.githubusercontent.com/MOCK_USER/MOCK_GIST_ID/raw/status.json'; // TO BE REPLACED

async function fetchStatus() {
    let usingFallback = false;
    let data = null;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
        const res = await fetch(`${WORKER_URL}/api/status`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Worker returned non-200');
        data = await res.json();
    } catch (e) {
        console.warn('Primary worker failed, falling back to GitHub Gist...', e);
        usingFallback = true;
        document.getElementById('outage-banner').style.display = 'block';
        try {
            const fallbackRes = await fetch(GIST_URL);
            data = await fallbackRes.json();
        } catch (fallbackError) {
            console.error('Both primary and fallback failed.');
            document.getElementById('services-container').innerHTML = '<p>Unable to retrieve status data. Complete monitoring blackout.</p>';
            return;
        }
    }

    renderStatus(data, usingFallback);
}

function renderStatus(data, usingFallback) {
    const servicesContainer = document.getElementById('services-container');
    const incidentsContainer = document.getElementById('incidents-container');
    const maintenanceContainer = document.getElementById('maintenance-container');
    const maintenanceSection = document.getElementById('maintenance-section');
    const historyByService = data.historyByService || {};

    // Render Services
    servicesContainer.innerHTML = '';
    const services = data.services || {};
    
    // If empty services object
    if (Object.keys(services).length === 0) {
        servicesContainer.innerHTML = '<p>No services configured.</p>';
    }

    for (const [id, service] of Object.entries(services)) {
        let displayStatus = service.status;
        let isUnknown = false;
        
        // Outage Fallback Logic per requirements
        if (usingFallback) {
            // Assume Cloudflare hosted things are partial outage, external is unknown
            // In a real scenario, we might have a flag in the service config indicating host provider
            // For now, if fallback is used, we append (Cached) or override status based on rules.
            if (displayStatus === 'Operational') {
                 displayStatus = 'Unknown (Fallback)';
                 isUnknown = true;
            }
        }

        const card = document.createElement('div');
        card.className = 'card';
        const safeStatus = normalizeStatusClass(displayStatus || 'Unknown');
        const latencyLabel = getLatencyLabel(service, displayStatus);
        const historyWidget = buildServiceHistoryWidget(historyByService[id] || []);
        card.innerHTML = `
            <div class="service-info">
                <span class="service-name">${service.name || id}</span>
                <span class="service-latency">Latency: ${latencyLabel}</span>
            </div>
            <div class="service-right">
                <div class="service-widget">
                    <div class="service-history-mini" style="grid-template-columns: repeat(${historyWidget.points.length || 1}, minmax(3px, 1fr));">${historyWidget.html}</div>
                    <div class="service-widget-caption">${historyWidget.caption}</div>
                </div>
                <div class="status-badge status-${isUnknown ? 'Unknown' : safeStatus}">${displayStatus || 'Unknown'}</div>
            </div>
        `;
        servicesContainer.appendChild(card);
    }

    // Render Maintenance
    const maintenance = data.maintenance || [];
    if (maintenance.length > 0) {
        maintenanceSection.style.display = 'block';
        maintenanceContainer.innerHTML = '';
        maintenance.forEach(m => {
            const card = document.createElement('div');
            card.className = 'incident-card';
            card.innerHTML = `
                <div class="incident-header">
                    <span class="incident-title"><a href="${m.url}" target="_blank" style="color: var(--accent-teal); text-decoration: none;">${m.title}</a></span>
                    <span class="incident-date">${new Date(m.created_at).toLocaleDateString()}</span>
                </div>
            `;
            maintenanceContainer.appendChild(card);
        });
    } else {
        maintenanceSection.style.display = 'none';
    }

    // Render Incidents
    const incidents = data.incidents || [];
    if (incidents.length > 0) {
        incidentsContainer.innerHTML = '';
        incidents.forEach(inc => {
            const card = document.createElement('div');
            card.className = 'incident-card';
            card.innerHTML = `
                <div class="incident-header">
                    <span class="incident-title">${inc.title} - <span class="status-badge status-${inc.status}">${inc.status}</span></span>
                    <span class="incident-date">${new Date(inc.createdAt).toLocaleString()}</span>
                </div>
                <div class="incident-desc">${inc.description}</div>
            `;
            incidentsContainer.appendChild(card);
        });
    }
}

function normalizeStatusClass(status) {
    return String(status || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
}

function getLatencyLabel(service, status) {
    const normalizedStatus = (status || '').toLowerCase();
    const hasMeasuredLatency = typeof service.latency === 'number' && Number.isFinite(service.latency) && service.latency > 0;

    if (normalizedStatus !== 'operational' || !hasMeasuredLatency) {
        return 'N/A';
    }

    return `${Math.round(service.latency)}ms`;
}

function buildServiceHistoryWidget(historySamples) {
    const points = Array.isArray(historySamples) ? historySamples.slice(-24) : [];

    if (points.length === 0) {
        return {
            points: [],
            html: '<span class="service-history-slot unknown" title="No heartbeat history yet"></span>',
            caption: 'No history yet'
        };
    }

    let upCount = 0;
    const html = points.map((point) => {
        const normalized = (point.status || '').toLowerCase();
        const isUp = normalized === 'operational';
        if (isUp) upCount += 1;
        const slotClass = isUp ? 'up' : normalized === 'down' ? 'down' : 'unknown';
        const timestamp = point.timestamp ? new Date(point.timestamp).toLocaleString() : 'Unknown sample time';
        const title = `${timestamp} - ${point.status || 'Unknown'}`;
        return `<span class="service-history-slot ${slotClass}" title="${title}"></span>`;
    }).join('');

    const uptimePct = Math.round((upCount / points.length) * 100);
    return {
        points,
        html,
        caption: `${uptimePct}% uptime (${points.length} checks)`
    };
}

document.addEventListener('DOMContentLoaded', fetchStatus);