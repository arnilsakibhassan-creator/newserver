'use strict';

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function setStatus(id, message, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = `status ${type}`.trim();
}

async function loadOrigins() {
  try {
    const data = await requestJson('/approval-nola-team/api/origins');
    renderOrigins(data.origins || []);
  } catch (error) {
    setStatus('originStatus', error.message, 'err');
  }
}

function renderOrigins(origins) {
  const root = document.getElementById('origins');
  root.innerHTML = '';
  setStatus('originStatus', `${origins.length} allowed origin(s)`);

  if (!origins.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No allowed origins';
    root.appendChild(empty);
    return;
  }

  for (const origin of origins) {
    const row = document.createElement('div');
    row.className = 'origin';

    const text = document.createElement('div');
    text.textContent = origin;

    const button = document.createElement('button');
    button.className = 'danger';
    button.textContent = 'Delete';
    button.addEventListener('click', () => deleteOrigin(origin));

    row.append(text, button);
    root.appendChild(row);
  }
}

async function addOrigin() {
  const input = document.getElementById('originInput');
  const origin = input.value.trim();
  if (!origin) return setStatus('originStatus', 'Enter an origin first', 'err');

  try {
    const data = await requestJson('/approval-nola-team/api/origins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin })
    });
    input.value = '';
    renderOrigins(data.origins || []);
  } catch (error) {
    setStatus('originStatus', error.message, 'err');
  }
}

async function deleteOrigin(origin) {
  if (!window.confirm(`Delete this origin?\n\n${origin}`)) return;
  try {
    const data = await requestJson('/approval-nola-team/api/origins', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin })
    });
    renderOrigins(data.origins || []);
  } catch (error) {
    setStatus('originStatus', error.message, 'err');
  }
}

function createTemplateCard(platform, meta) {
  const box = document.createElement('article');
  box.className = 'template';

  const title = document.createElement('h3');
  title.textContent = `${platform.toUpperCase()} Template`;

  const metadata = document.createElement('div');
  metadata.className = 'meta';

  const rows = [
    ['Description', meta.description || '—'],
    ['File', meta.filename || '—'],
    ['Updated', meta.updatedAt ? new Date(meta.updatedAt).toLocaleString() : 'Never']
  ];

  for (const [label, value] of rows) {
    const strong = document.createElement('strong');
    strong.textContent = label;
    const span = document.createElement('span');
    span.textContent = value;
    metadata.append(strong, span);
  }

  const descField = document.createElement('div');
  descField.className = 'field';
  const descLabel = document.createElement('label');
  descLabel.htmlFor = `desc-${platform}`;
  descLabel.textContent = 'Description';
  const textarea = document.createElement('textarea');
  textarea.id = `desc-${platform}`;
  textarea.placeholder = `Describe this ${platform.toUpperCase()} template update`;
  descField.append(descLabel, textarea);

  const fileField = document.createElement('div');
  fileField.className = 'field';
  const fileLabel = document.createElement('label');
  fileLabel.htmlFor = `file-${platform}`;
  fileLabel.textContent = 'HTML file';
  const file = document.createElement('input');
  file.id = `file-${platform}`;
  file.type = 'file';
  file.accept = '.html,.htm,text/html';
  fileField.append(fileLabel, file);

  const button = document.createElement('button');
  button.className = 'primary upload-btn';
  button.textContent = `Upload ${platform.toUpperCase()} & Re-encrypt`;
  button.addEventListener('click', () => uploadTemplate(platform));

  const status = document.createElement('div');
  status.id = `status-${platform}`;
  status.className = 'status';

  box.append(title, metadata, descField, fileField, button, status);
  return box;
}

async function loadTemplates() {
  try {
    const data = await requestJson('/approval-nola-team/api/templates');
    const root = document.getElementById('templates');
    root.innerHTML = '';
    root.append(
      createTemplateCard('win', data.win || {}),
      createTemplateCard('mac', data.mac || {})
    );
    setStatus('templateStatus', 'WIN and MAC uploaders loaded', 'ok');
  } catch (error) {
    setStatus('templateStatus', error.message, 'err');
  }
}

async function uploadTemplate(platform) {
  const fileInput = document.getElementById(`file-${platform}`);
  const descriptionInput = document.getElementById(`desc-${platform}`);
  const file = fileInput.files[0];
  const description = descriptionInput.value.trim();

  if (!file) return setStatus(`status-${platform}`, 'Choose an HTML file', 'err');
  if (!description) return setStatus(`status-${platform}`, 'Description is required', 'err');

  const form = new FormData();
  form.append('file', file);
  form.append('description', description);

  try {
    setStatus(`status-${platform}`, 'Uploading and re-encrypting...');
    await requestJson(`/approval-nola-team/api/templates/${platform}`, {
      method: 'POST',
      body: form
    });
    await loadTemplates();
    setStatus(`status-${platform}`, 'Updated and re-encrypted successfully', 'ok');
  } catch (error) {
    setStatus(`status-${platform}`, error.message, 'err');
  }
}

document.getElementById('addOriginBtn').addEventListener('click', addOrigin);
document.getElementById('originInput').addEventListener('keydown', event => {
  if (event.key === 'Enter') addOrigin();
});

Promise.all([loadOrigins(), loadTemplates()]).catch(() => {});
