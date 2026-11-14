const $ = (selector) => document.querySelector(selector);
let authMode = 'login';
let activeProject = null;

async function request(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function jsonOptions(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function showMessage(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('error', isError);
}
function setAuthMode(mode) {
  authMode = mode;
  $('#loginTab').classList.toggle('active', mode === 'login');
  $('#registerTab').classList.toggle('active', mode === 'register');
  $('#authSubmit').textContent = mode === 'login' ? 'Sign in' : 'Create account';
  $('#passwordInput').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  showMessage($('#authMessage'), mode === 'register' ? 'Use at least 10 characters for your password.' : '');
}
function showView(view) {
  $('#authView').hidden = view !== 'auth';
  $('#dashboard').hidden = view !== 'dashboard';
  $('#assistant').hidden = view !== 'assistant';
  $('#mainNav').hidden = view === 'auth';
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
async function loadProjects() {
  const { projects } = await request('/api/projects');
  const list = $('#projectList');
  list.replaceChildren();
  $('#projectEmpty').hidden = projects.length > 0;
  for (const project of projects) {
    const card = element('article', 'project-card');
    const top = element('div', 'project-card-top');
    const title = element('h3', '', project.name);
    const actions = element('div', 'project-actions');
    const edit = element('button', 'icon-button', 'Edit');
    edit.type = 'button'; edit.setAttribute('aria-label', `Edit ${project.name}`);
    edit.addEventListener('click', () => openProjectForm(project));
    const remove = element('button', 'icon-button danger', 'Delete');
    remove.type = 'button'; remove.setAttribute('aria-label', `Delete ${project.name}`);
    remove.addEventListener('click', () => deleteProject(project));
    actions.append(edit, remove);
    top.append(title, actions);
    card.append(top, element('p', 'project-description', project.description || 'No description yet.'));
    const open = element('button', 'button button-quiet open-project', 'Open AI workspace →');
    open.type = 'button'; open.addEventListener('click', () => openAssistant(project));
    card.append(open);
    list.append(card);
  }
}
function openProjectForm(project = null) {
  $('#projectForm').reset();
  $('#projectId').value = project?.id || '';
  $('#projectName').value = project?.name || '';
  $('#projectDescription').value = project?.description || '';
  $('#projectFormTitle').textContent = project ? 'Edit project' : 'Create a project';
  $('#projectFormWrap').hidden = false;
  $('#projectName').focus();
}
function openAssistant(project = null) {
  activeProject = project;
  $('#assistantTitle').textContent = project ? project.name : 'Ask the assistant';
  $('#assistantDescription').textContent = project ? (project.description || 'Ask questions and get implementation guidance for this project.') : 'Describe a task, share an error, or ask for an implementation plan.';
  $('#chatResult').replaceChildren(element('p', 'muted', 'Your response will appear here.'));
  showView('assistant');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteProject(project) {
  if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return;
  try {
    await request(`/api/projects/${project.id}`, { method: 'DELETE' });
    await loadProjects();
  } catch (error) {
    window.alert(error.message);
  }
}
async function initialize() {
  try {
    const [auth, summary] = await Promise.all([request('/api/auth/me'), request('/api/summary')]);
    $('#providerStatus').textContent = `AI provider: ${summary.aiProvider}`;
    if (auth.user) {
      $('#userEmail').textContent = auth.user.email;
      showView('dashboard');
      await loadProjects();
    } else showView('auth');
  } catch {
    showView('auth');
    showMessage($('#authMessage'), 'Could not connect to the server. Please refresh and try again.', true);
  }
}

$('#loginTab').addEventListener('click', () => setAuthMode('login'));
$('#registerTab').addEventListener('click', () => setAuthMode('register'));
$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#authSubmit');
  button.disabled = true;
  showMessage($('#authMessage'), authMode === 'login' ? 'Signing in…' : 'Creating account…');
  try {
    const result = await request(`/api/auth/${authMode}`, jsonOptions('POST', { email: $('#emailInput').value, password: $('#passwordInput').value }));
    $('#userEmail').textContent = result.user.email;
    $('#passwordInput').value = '';
    showView('dashboard');
    await loadProjects();
  } catch (error) {
    showMessage($('#authMessage'), error.message, true);
  } finally { button.disabled = false; }
});
$('#logoutButton').addEventListener('click', async () => {
  await request('/api/auth/logout', { method: 'POST' });
  $('#authForm').reset();
  setAuthMode('login');
  showView('auth');
});
$('#newProjectButton').addEventListener('click', () => openProjectForm());
$('#cancelProjectButton').addEventListener('click', () => { $('#projectFormWrap').hidden = true; });
$('#projectForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = $('#projectId').value;
  const payload = { name: $('#projectName').value, description: $('#projectDescription').value };
  try {
    await request(id ? `/api/projects/${id}` : '/api/projects', jsonOptions(id ? 'PUT' : 'POST', payload));
    $('#projectFormWrap').hidden = true;
    await loadProjects();
  } catch (error) { showMessage($('#projectMessage'), error.message, true); }
});
$('#backToProjects').addEventListener('click', async () => { showView('dashboard'); await loadProjects(); });
$('#chatForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#sendButton');
  const result = $('#chatResult');
  button.disabled = true;
  button.textContent = 'Working…';
  result.replaceChildren(element('p', 'muted', 'Generating a response…'));
  const projectContext = activeProject ? `Project: ${activeProject.name}\nDescription: ${activeProject.description}\n\n` : '';
  try {
    const data = await request('/api/chat', jsonOptions('POST', { prompt: projectContext + $('#chatPrompt').value, mode: $('#chatMode').value }));
    result.replaceChildren(element('div', 'ai-response', data.result.response));
  } catch (error) { result.replaceChildren(element('p', 'message error', error.message)); }
  finally { button.disabled = false; button.textContent = 'Generate response'; }
});

setAuthMode('login');
initialize();
