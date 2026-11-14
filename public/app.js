async function fetchJSON(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Request failed with status ${response.status}`);
  }
  return response.json();
}

async function loadSummary() {
  try {
    const summary = await fetchJSON('/api/summary');
    const statusBox = document.getElementById('apiStatus');
    statusBox.textContent = JSON.stringify(summary, null, 2);
    document.getElementById('statusText').textContent = summary.status;
  } catch (error) {
    document.getElementById('apiStatus').textContent = `Error: ${error.message}`;
  }
}

async function loadFeatures() {
  try {
    const data = await fetchJSON('/api/features');
    const featureList = document.getElementById('featureList');
    featureList.innerHTML = data.features
      .map(
        (feature) => `
          <article class="feature-card">
            <h3>${feature.title}</h3>
            <p>${feature.description}</p>
          </article>
        `
      )
      .join('');
  } catch (error) {
    document.getElementById('featureList').innerHTML = `<p>Error loading feature data: ${error.message}</p>`;
  }
}

async function generatePlan(event) {
  event.preventDefault();

  const prompt = document.getElementById('promptInput').value.trim();
  const mode = document.getElementById('modeSelect').value;
  const resultPanel = document.getElementById('resultPanel');

  if (!prompt) {
    resultPanel.innerHTML = `
      <h3>Generated output</h3>
      <p class="empty-state">Please enter a task description before generating a plan.</p>
    `;
    return;
  }

  try {
    const response = await fetchJSON('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, mode })
    });

    const { result } = response;

    resultPanel.innerHTML = `
      <h3>Generated output</h3>
      <div class="summary-box">
        <strong>Summary:</strong> ${result.summary}
      </div>

      <div class="suggestions">
        <strong>Suggested next steps:</strong>
        <ul>
          ${result.suggestions.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>

      <div class="checklist">
        <strong>Checklist:</strong>
        <ul>
          ${result.checklist.map(item => `<li>${item}</li>`).join('')}
        </ul>
      </div>

      <div class="code-block">
        <pre>${escapeHtml(result.snippet)}</pre>
      </div>
    `;
  } catch (error) {
    resultPanel.innerHTML = `
      <h3>Generated output</h3>
      <p class="empty-state">Error: ${error.message}</p>
    `;
  }
}

async function generateChatResponse(event) {
  event.preventDefault();

  const prompt = document.getElementById('chatPrompt').value.trim();
  const mode = document.getElementById('chatMode').value;
  const chatResult = document.getElementById('chatResult');

  if (!prompt) {
    chatResult.innerHTML = `
      <h3>AI response</h3>
      <p class="empty-state">Please enter a prompt before sending it to the AI.</p>
    `;
    return;
  }

  try {
    const response = await fetchJSON('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, mode })
    });

    chatResult.innerHTML = `
      <h3>AI response</h3>
      <div class="ai-response">${escapeHtml(response.result.response)}</div>
    `;
  } catch (error) {
    chatResult.innerHTML = `
      <h3>AI response</h3>
      <p class="empty-state">Error: ${error.message}</p>
    `;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

document.getElementById('loadSummary').addEventListener('click', loadSummary);
document.getElementById('loadFeatures').addEventListener('click', loadFeatures);
document.getElementById('planForm').addEventListener('submit', generatePlan);
document.getElementById('chatForm').addEventListener('submit', generateChatResponse);

loadSummary();
loadFeatures();
