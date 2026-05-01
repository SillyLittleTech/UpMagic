// During local development (static server on localhost), point API calls to the local Worker.
const WORKER_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
    ? 'http://127.0.0.1:8787'
    : '';

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
        } else {
            setFeedback(feedback, `Failed: ${res.statusText}`, 'error');
        }
    } catch (e) {
        setFeedback(feedback, `Error: ${e.message}`, 'error');
    }
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