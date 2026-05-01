const WORKER_URL = ''; // Relative to the same domain in CF Pages

document.addEventListener('DOMContentLoaded', loadIncidentList);

async function updateServiceStatus() {
    const serviceId = document.getElementById('service-id').value;
    const status = document.getElementById('force-status').value;
    const feedback = document.getElementById('service-feedback');
    setFeedback(feedback, '', null);

    try {
        const res = await fetch(`${WORKER_URL}/api/admin/update_service`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ serviceId, status })
        });

        if (res.ok) {
            setFeedback(feedback, 'Service status updated successfully!', 'success');
        } else {
            setFeedback(feedback, `Failed: ${res.statusText}`, 'error');
        }
    } catch (e) {
        setFeedback(feedback, `Error: ${e.message}`, 'error');
    }
}

async function postIncident() {
    const title = document.getElementById('inc-title').value;
    const status = document.getElementById('inc-status').value;
    const description = document.getElementById('inc-desc').value;
    const feedback = document.getElementById('incident-feedback');

    if (!title || !description) {
        setFeedback(feedback, 'Please fill out all fields.', 'error');
        return;
    }

    setFeedback(feedback, '', null);

    try {
        const res = await fetch(`${WORKER_URL}/api/admin/incident`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title, status, description })
        });

        if (res.ok) {
            setFeedback(feedback, 'Incident posted successfully!', 'success');
            document.getElementById('inc-title').value = '';
            document.getElementById('inc-desc').value = '';
            await loadIncidentList();
        } else {
            setFeedback(feedback, `Failed: ${res.statusText}`, 'error');
        }
    } catch (e) {
        setFeedback(feedback, `Error: ${e.message}`, 'error');
    }
}

async function loadIncidentList() {
    const listEl = document.getElementById('admin-incidents-list');
    if (!listEl) return;

    listEl.innerHTML = '<p class="loading-text">Loading investigation entries...</p>';

    try {
        const res = await fetch(`${WORKER_URL}/api/status`);
        if (!res.ok) {
            listEl.innerHTML = '<p class="loading-text">Unable to load entries right now.</p>';
            return;
        }

        const data = await res.json();
        const incidents = Array.isArray(data.incidents) ? data.incidents : [];

        if (incidents.length === 0) {
            listEl.innerHTML = '<p class="loading-text">No entries in the investigation list.</p>';
            return;
        }

        listEl.innerHTML = incidents.map((incident) => {
            const createdLabel = incident.createdAt ? new Date(incident.createdAt).toLocaleString() : 'Unknown time';
            return `
                <article class="admin-incident-item">
                    <div class="admin-incident-meta">
                        <p class="admin-incident-title">${escapeHtml(incident.title || 'Untitled')}</p>
                        <p class="admin-incident-subtitle">${escapeHtml(incident.status || 'Unknown')} • ${escapeHtml(createdLabel)}</p>
                    </div>
                    <button class="btn btn-danger" onclick="removeIncident('${encodeURIComponent(incident.id || '')}')">Remove</button>
                </article>
            `;
        }).join('');
    } catch (e) {
        listEl.innerHTML = '<p class="loading-text">Unable to load entries right now.</p>';
    }
}

async function removeIncident(encodedIncidentId) {
    const incidentId = decodeURIComponent(encodedIncidentId || '');
    const feedback = document.getElementById('remove-incident-feedback');
    if (!incidentId) {
        setFeedback(feedback, 'Missing incident ID.', 'error');
        return;
    }

    setFeedback(feedback, '', null);

    try {
        const res = await fetch(`${WORKER_URL}/api/admin/remove_incident`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ incidentId })
        });

        if (res.ok) {
            setFeedback(feedback, 'Investigation entry removed.', 'success');
            await loadIncidentList();
        } else {
            let errorMessage = `Failed: ${res.statusText}`;
            try {
                const body = await res.json();
                if (body?.error) errorMessage = `Failed: ${body.error}`;
            } catch {
                // keep fallback message
            }
            setFeedback(feedback, errorMessage, 'error');
        }
    } catch (e) {
        setFeedback(feedback, `Error: ${e.message}`, 'error');
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function setFeedback(element, message, type) {
    element.textContent = message;
    element.classList.remove('feedback-success', 'feedback-error');

    if (type === 'success') {
        element.classList.add('feedback-success');
    } else if (type === 'error') {
        element.classList.add('feedback-error');
    }
}