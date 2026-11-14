async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
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

document.getElementById('loadSummary').addEventListener('click', loadSummary);
document.getElementById('loadFeatures').addEventListener('click', loadFeatures);

loadSummary();
loadFeatures();
