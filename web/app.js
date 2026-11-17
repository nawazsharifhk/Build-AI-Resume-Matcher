(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const HISTORY_KEY = 'matcha-history-v1';
  const SETTINGS_KEY = 'matcha-ollama-v1';
  const THEME_KEY = 'matcha-theme-v1';
  const DEFAULT_OLLAMA_MODEL = 'qwen3.5:2b-q4_K_M';
  const sampleResume = `Jordan Lee\nProduct Designer | jordan.lee@email.com | linkedin.com/in/jordanlee\n\nSUMMARY\nProduct designer with 5 years of experience turning complex workflows into clear, accessible digital products. Partnered with product, engineering, and research teams to ship measurable improvements for SaaS customers.\n\nEXPERIENCE\nSenior Product Designer · Northstar Software · 2022–Present\n• Led end-to-end redesign of the account onboarding flow with a cross-functional team, reducing completion time by 32%.\n• Conducted user research and usability testing with 24 customers; translated findings into a prioritized product roadmap.\n• Built and maintained a React design system with engineering, improving component adoption across three product teams.\n• Partnered with product management and data analysis to run experiments that lifted activation by 18%.\nProduct Designer · Brightside Studio · 2020–2022\n• Designed responsive product experiences for 6 B2B clients using Figma, HTML, and CSS.\n• Presented research-backed concepts to stakeholders and documented reusable design patterns.\n\nSKILLS\nProduct design, Figma, user research, usability testing, prototyping, accessibility, React, HTML, CSS, data analysis, collaboration, communication, agile, design systems\n\nEDUCATION\nB.Des. Interaction Design · Pacific Arts University · 2020\n\nPROJECTS\nOpen Source Design System · Contributed accessible React components and documentation.`;
  const sampleJob = `Product Designer — Northstar Labs\n\nWe are looking for a thoughtful Product Designer to shape simple, accessible experiences for our collaboration platform. You will work with product management, engineering, and research to understand customer needs, define the roadmap, and turn complex workflows into intuitive interfaces.\n\nResponsibilities\n• Lead user research, usability testing, prototyping, and interaction design from discovery through delivery.\n• Partner with product managers and cross-functional teams to prioritize opportunities and measure impact through data analysis and experiments.\n• Create and maintain a scalable design system; collaborate with engineering on React implementations.\n• Advocate for accessibility and clear communication across the customer journey.\n\nWhat you bring\n• 4+ years of product design experience and a strong portfolio.\n• Expertise in Figma, user research, prototyping, and accessibility.\n• Experience with design systems, React, and agile product teams.\n• Excellent collaboration, communication, and problem solving skills.\n• A track record of connecting customer insight to measurable product outcomes.`;

  let selectedFile = null;
  let selectedJobFile = null;
  let activeSource = 'upload';
  let activeJobSource = 'paste';
  let toastTimer = null;
  let currentResult = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function getHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function saveHistory(value) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(value.slice(0, 30))); }
    catch { toast('Browser storage is full. Clear some saved analyses and try again.'); }
    updateHistory();
  }

  function settings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      const model = !saved.model || saved.model === 'qwen3.5:latest' ? DEFAULT_OLLAMA_MODEL : saved.model;
      return { base_url: 'http://127.0.0.1:11434', ...saved, model };
    } catch { return { base_url: 'http://127.0.0.1:11434', model: DEFAULT_OLLAMA_MODEL }; }
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2700);
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return 'Recently';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  function switchView(name) {
    const isHistory = name === 'history';
    $('#workspaceView').classList.toggle('active', !isHistory);
    $('#historyView').classList.toggle('active', isHistory);
    $$('.nav-link[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === name));
    $('#breadcrumbPage').textContent = isHistory ? 'My analyses' : 'Match workspace';
    $('#sidebar').classList.remove('open');
    if (isHistory) renderHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateHistory() {
    const history = getHistory();
    $('#historyCount').textContent = history.length;
    $('#analysisTotal').textContent = history.length;
    const average = history.length ? Math.round(history.reduce((sum, item) => sum + item.score, 0) / history.length) : null;
    $('#averageMatch').innerHTML = average === null ? '—<small> no data yet</small>' : `${average}%`;
    const best = history.reduce((item, current) => !item || current.score > item.score ? current : item, null);
    $('#bestMatch').innerHTML = best ? `${escapeHtml(best.role || 'Target role')}<small> ${best.score}% fit</small>` : '—<small> run your first match</small>';
    const recent = $('#recentList');
    if (!history.length) {
      recent.innerHTML = '<div class="empty-recent"><span class="empty-icon"><svg viewBox="0 0 24 24"><path d="M4.5 5.5h15v13h-15z"/><path d="M8 9h8m-8 3h8m-8 3h4"/></svg></span><strong>Your matches will show up here</strong><span>Run an analysis to get started.</span></div>';
    } else {
      recent.innerHTML = history.slice(0, 3).map(item => `<button class="recent-entry" type="button" data-open-result="${escapeHtml(item.id)}"><span class="recent-score">${item.score}%</span><span><strong>${escapeHtml(item.role || 'Target role')}</strong><small>${escapeHtml(formatDate(item.created_at))} · ${escapeHtml(item.resume_name || 'Resume')}</small></span><span class="recent-arrow">›</span></button>`).join('');
    }
    $$('#recentList [data-open-result]').forEach(button => button.addEventListener('click', () => openHistoryResult(button.dataset.openResult)));
  }

  function renderHistory() {
    const history = getHistory();
    const query = ($('#historySearch').value || '').trim().toLowerCase();
    const filtered = history.filter(item => `${item.role} ${item.resume_name}`.toLowerCase().includes(query));
    $('#historyHeadingCount').textContent = `${history.length} ${history.length === 1 ? 'analysis' : 'analyses'}`;
    const grid = $('#historyGrid');
    grid.innerHTML = filtered.map(item => `<article class="history-card" data-card="${escapeHtml(item.id)}"><div class="history-card-top"><span class="history-card-score">${item.score}<small>%</small></span><span class="history-card-date">${escapeHtml(formatDate(item.created_at))}</span></div><h3 title="${escapeHtml(item.role || 'Target role')}">${escapeHtml(item.role || 'Target role')}</h3><div class="history-card-file">${escapeHtml(item.resume_name || 'Resume')}</div><div class="history-card-stats"><span><b>${(item.matched_skills || []).length}</b> strengths</span><span>${(item.missing_skills || []).length} gaps</span><span>${escapeHtml(item.engine || 'Local NLP')}</span></div><div class="history-card-actions"><button class="history-view" data-open-result="${escapeHtml(item.id)}">View report →</button><button class="history-delete" data-delete-result="${escapeHtml(item.id)}">Remove</button></div></article>`).join('');
    const isEmpty = history.length === 0;
    const noMatches = !isEmpty && filtered.length === 0;
    $('#historyEmpty').hidden = !isEmpty;
    if (noMatches) grid.innerHTML = '<div class="empty-recent"><strong>No matching analyses</strong><span>Try a different role or file name.</span></div>';
    $('#clearHistoryButton').disabled = isEmpty;
    $('#clearHistoryButton').style.opacity = isEmpty ? '.5' : '1';
    $$('[data-open-result]', grid).forEach(button => button.addEventListener('click', event => { event.stopPropagation(); openHistoryResult(button.dataset.openResult); }));
    $$('[data-delete-result]', grid).forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      const updated = getHistory().filter(item => item.id !== button.dataset.deleteResult);
      saveHistory(updated);
      renderHistory();
      toast('Analysis removed from this device.');
    }));
    $$('.history-card', grid).forEach(card => card.addEventListener('click', () => openHistoryResult(card.dataset.card)));
  }

  function openHistoryResult(id) {
    const result = getHistory().find(item => item.id === id);
    if (!result) return;
    currentResult = result;
    switchView('workspace');
    renderResult(result, false);
    $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#131420' : '#f6f7fb';
  }

  function showModal(id) {
    $(id).hidden = false;
    const focus = $('.text-input', $(id));
    if (focus) setTimeout(() => focus.focus(), 30);
  }

  function closeModals() { $$('.modal-backdrop').forEach(modal => { modal.hidden = true; }); }

  async function api(path, options = {}) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`);
    return data;
  }

  async function checkHealth() {
    const status = $('#serviceStatus');
    try {
      await api('/api/health');
      let ollama = null;
      try { ollama = await api('/api/ollama/status'); } catch {}
      status.className = 'service-status ok';
      if (ollama?.connected && ollama.model_available) {
        status.querySelector('span').textContent = `Ollama connected · ${ollama.model}`;
        $('#llmHelp').textContent = `Ready to use ${ollama.model} on your computer`;
      } else if (ollama?.connected) {
        status.querySelector('span').textContent = 'Ollama running · model missing';
        $('#llmHelp').textContent = `Ollama is running, but ${ollama.model} is not installed. Open Settings and find an installed model.`;
      } else {
        status.querySelector('span').textContent = 'Local API ready · Ollama starts on use';
        $('#llmHelp').textContent = 'Ollama will start automatically when you enable local AI';
      }
    } catch {
      status.className = 'service-status off';
      status.querySelector('span').textContent = 'Local API unavailable';
    }
  }

  function toggleLoading(loading) {
    const button = $('#analyzeButton');
    button.disabled = loading;
    button.classList.toggle('loading', loading);
    $('.button-label', button).textContent = loading ? 'Building your report…' : 'Analyze my match';
    $('#formError').hidden = true;
  }

  async function handleAnalyze(event) {
    event.preventDefault();
    const errorBox = $('#formError');
    if (activeSource === 'upload' && !selectedFile) {
      errorBox.textContent = 'Choose a resume file, or switch to “Paste text” to enter your resume.';
      errorBox.hidden = false;
      return;
    }
    if (activeSource === 'paste' && $('#resumeText').value.trim().length < 80) {
      errorBox.textContent = 'Add at least a few lines of resume text, or choose a resume file.';
      errorBox.hidden = false;
      return;
    }
    if (activeJobSource === 'upload' && !selectedJobFile) {
      errorBox.textContent = 'Choose a job description file, or switch to “Paste text”.';
      errorBox.hidden = false;
      return;
    }
    if (activeJobSource === 'paste' && $('#jobDescription').value.trim().length < 50) {
      errorBox.textContent = 'Paste a job description with at least 50 characters, or upload a file.';
      errorBox.hidden = false;
      return;
    }
    const formData = new FormData();
    formData.set('role', $('#roleInput').value.trim());
    if (activeSource === 'upload') formData.set('file', selectedFile);
    else formData.set('resume_text', $('#resumeText').value.trim());
    if (activeJobSource === 'upload') formData.set('job_file', selectedJobFile);
    else formData.set('job_description', $('#jobDescription').value.trim());
    const prefs = settings();
    const useLlm = $('#llmEnabled').checked;
    formData.set('llm_enabled', String(useLlm));
    formData.set('ollama_url', prefs.base_url);
    formData.set('ollama_model', prefs.model);
    toggleLoading(true);
    try {
      const result = await api('/api/analyze', { method: 'POST', body: formData });
      currentResult = result;
      const history = getHistory().filter(item => item.id !== result.id);
      saveHistory([result, ...history]);
      renderResult(result, true);
      $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast(result.llm_warning || (useLlm && result.engine.includes('unavailable') ? 'Ollama was unavailable. Your local NLP report is ready.' : 'Your match report is ready.'));
    } catch (error) {
      errorBox.textContent = error.message || 'Something went wrong. Please check the inputs and try again.';
      errorBox.hidden = false;
    } finally { toggleLoading(false); }
  }

  function normalizeCourse(course) {
    const skills = Array.isArray(course.related_skills) ? course.related_skills : [];
    try {
      const parsed = new URL(course.url);
      if (parsed.hostname.toLowerCase().endsWith('coursera.org')) return { ...course, provider: 'Coursera' };
    } catch { /* Convert legacy provider links below. */ }
    const topic = skills.join(' ') || course.title || 'career skills';
    return {
      ...course,
      title: `Coursera courses for ${skills.join(', ') || topic}`,
      provider: 'Coursera',
      url: `https://www.coursera.org/courses?query=${encodeURIComponent(topic)}`,
      format: 'Search courses by topic',
      cost: 'Varies by course; check Coursera for current pricing',
      reason: `Explore Coursera courses for ${topic} and choose one with hands-on practice relevant to this role.`,
    };
  }

  function renderResult(result, fresh) {
    const score = Number(result.score) || 0;
    const metrics = result.metrics || {};
    const matched = Array.isArray(result.matched_skills) ? result.matched_skills : [];
    const missing = Array.isArray(result.missing_skills) ? result.missing_skills : [];
    const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
    const questions = Array.isArray(result.interview_questions) ? result.interview_questions : [];
    const courses = Array.isArray(result.course_recommendations) ? result.course_recommendations.map(normalizeCourse) : [];
    const keywords = Array.isArray(result.keyword_overlap) ? result.keyword_overlap : [];
    const verdict = score >= 80 ? 'Strong alignment' : score >= 60 ? 'Good foundation' : score >= 40 ? 'Room to grow' : 'A stretch role';
    const ringColor = score >= 75 ? 'var(--green)' : score >= 45 ? 'var(--accent)' : 'var(--amber-ink)';
    const skillMarkup = (items, className = '') => items.length ? items.map(item => `<span class="skill-chip ${className}">${escapeHtml(item)}</span>`).join('') : '<span class="skill-empty">No terms detected in this section.</span>';
    const keywordMarkup = keywords.map(item => `<span class="keyword-chip">${escapeHtml(item)}</span>`).join('');
    const courseMarkup = courses.length ? courses.map((course, index) => `<article class="course-card"><div class="course-card-top"><span class="course-number">${String(index + 1).padStart(2, '0')}</span><span class="course-gap-label">SKILL GAP</span></div><h4>${escapeHtml(course.title)}</h4><div class="course-provider">${escapeHtml(course.provider)} <span>·</span> ${escapeHtml(course.format)}</div><div class="course-skills">${(course.related_skills || []).map(skill => `<span class="skill-chip missing">${escapeHtml(skill)}</span>`).join('')}</div><p class="course-reason">${escapeHtml(course.reason || '')}</p><div class="course-practice"><strong>Connect it to your interview prep</strong>${(course.practice_questions || []).map(question => `<p>${escapeHtml(question)}</p>`).join('')}</div><div class="course-footer"><span class="course-cost">${escapeHtml(course.cost || 'Check provider for current terms')}</span><a href="${escapeHtml(course.url)}" target="_blank" rel="noopener noreferrer">Browse Coursera courses <span>↗</span></a></div></article>`).join('') : '<div class="course-empty"><span>✓</span><div><strong>No skill gaps detected in the catalogued requirements.</strong><p>Use the practice questions to deepen your examples for this role.</p></div></div>';
    $('#resultsSection').innerHTML = `<div class="result-heading"><div><span class="step-label"><span>04</span> YOUR MATCH REPORT</span><h2>${escapeHtml(result.role || 'Target role')}</h2><p>${escapeHtml(result.summary || '')} <span>·</span> ${fresh ? 'Just now' : `Viewed ${escapeHtml(formatDate(result.created_at))}`}</p></div><div class="report-actions"><button class="outline-button" id="copyReportButton"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>Copy tips</button><button class="outline-button" id="downloadReportButton"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0 4-4m-4 4-4-4"/><path d="M5 17v3h14v-3"/></svg>Download report</button></div></div><div class="result-grid"><section class="score-card"><span class="result-kicker">YOUR ROLE ALIGNMENT</span><div class="score-ring" style="--score:${score};--ring:${ringColor}"><div class="score-inner"><strong>${score}<small>%</small></strong><span>match score</span></div></div><strong class="score-verdict">${verdict}</strong><p class="score-explain">${escapeHtml(result.summary || 'A directional comparison of your resume and this role.')}</p><div class="score-metrics"><div class="metric-line"><span>Skill coverage</span><strong>${Number(metrics.skill_coverage) || 0}%</strong><div class="metric-bar"><i style="width:${Number(metrics.skill_coverage) || 0}%"></i></div></div><div class="metric-line"><span>Keyword relevance</span><strong>${Number(metrics.relevance) || 0}%</strong><div class="metric-bar"><i style="width:${Number(metrics.relevance) || 0}%"></i></div></div><div class="metric-line"><span>Resume completeness</span><strong>${Number(metrics.resume_quality) || 0}%</strong><div class="metric-bar"><i style="width:${Number(metrics.resume_quality) || 0}%"></i></div></div></div></section><section class="matches-card"><div class="match-intro"><div><span class="result-kicker">THE OVERLAP</span><h3>Skills at a glance</h3></div><span class="match-badge">${matched.length} of ${Number(result.requirements_count) || matched.length + missing.length} aligned</span></div><div class="skill-section"><div class="skill-section-title"><i></i>FOUND IN BOTH</div><div class="skill-chips">${skillMarkup(matched)}</div></div><div class="skill-section missing"><div class="skill-section-title"><i></i>NOT FOUND IN RESUME</div><div class="skill-chips">${skillMarkup(missing, 'missing')}</div></div><div class="skill-section"><div class="keywords-row"><span>Shared terms</span>${keywordMarkup || '<span class="skill-empty">No notable keyword overlap detected.</span>'}</div></div><div class="result-disclaimer"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>A “gap” means a phrase was not found in your resume text. Add it only if it reflects real experience.</div></section></div><div class="result-lower-grid"><section class="result-panel"><div class="result-panel-heading"><div><span class="result-icon"><svg viewBox="0 0 24 24"><path d="M12 3.5 13.7 9l5.4 2-5.4 2L12 18.5 10.3 13l-5.4-2 5.4-2L12 3.5Z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z"/></svg></span><div><span class="result-kicker">MAKE IT STRONGER</span><h3>Personalized suggestions</h3></div></div><button class="copy-button" data-copy="suggestions"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>Copy</button></div><ol>${suggestions.length ? suggestions.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No suggestions available for this report.</li>'}</ol></section><section class="result-panel questions"><div class="result-panel-heading"><div><span class="result-icon questions"><svg viewBox="0 0 24 24"><path d="M4 5.5h16v11H9l-5 3v-14Z"/><path d="M8 9h8m-8 4h5"/></svg></span><div><span class="result-kicker">WALK IN PREPARED</span><h3>Practice these questions</h3></div></div><button class="copy-button" data-copy="interview_questions"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>Copy</button></div><ol>${questions.length ? questions.map(item => `<li>${escapeHtml(item)}</li>`).join('') : '<li>No questions available for this report.</li>'}</ol></section></div><section class="course-recommendations"><div class="course-section-heading"><div><span class="step-label"><span>05</span> LEARN THE GAPS</span><h3>Coursera courses for your skill gaps</h3><p>Each missing skill links to Coursera course results and a related question to practice.</p></div></div><div class="course-grid">${courseMarkup}</div><p class="course-disclaimer">Course availability and pricing can change. Check the provider’s page before enrolling.</p></section><div class="result-disclaimer"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>Directional guidance, not a hiring prediction. The score combines detected skill coverage, shared keywords, and resume section completeness. Engine: ${escapeHtml(result.engine || 'Local NLP')}.</div>`;
    const sourceLine = document.createElement('p');
    sourceLine.className = 'source-files';
    sourceLine.textContent = `Resume: ${result.resume_name || 'Resume'} · Job description: ${result.job_description_name || 'Pasted text'}`;
    $('.result-heading > div').append(sourceLine);
    const section = $('#resultsSection');
    section.hidden = false;
    $('#copyReportButton').addEventListener('click', () => copyText(suggestions.map((x, i) => `${i + 1}. ${x}`).join('\n'), 'Suggestions copied.'));
    $('#downloadReportButton').addEventListener('click', () => downloadReport(result));
    $$('[data-copy]', section).forEach(button => button.addEventListener('click', () => {
      const items = result[button.dataset.copy] || [];
      copyText(items.map((x, i) => `${i + 1}. ${x}`).join('\n'), `${button.dataset.copy === 'suggestions' ? 'Suggestions' : 'Questions'} copied.`);
    }));
  }

  async function copyText(text, message) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
    toast(message);
  }

  function downloadReport(result) {
    const content = [
      'RESUME MATCH AI — MATCH REPORT',
      `Role: ${result.role || 'Target role'}`,
      `Resume: ${result.resume_name || 'Resume'}`,
      `Job description: ${result.job_description_name || 'Pasted text'}`,
      `Date: ${formatDate(result.created_at)}`,
      `Match score: ${result.score}%`,
      `Summary: ${result.summary || ''}`,
      '', 'SKILLS FOUND IN BOTH', ...(result.matched_skills || []).map(item => `• ${item}`),
      '', 'SKILLS NOT FOUND IN RESUME', ...(result.missing_skills || []).map(item => `• ${item}`),
      '', 'PERSONALIZED SUGGESTIONS', ...(result.suggestions || []).map((item, i) => `${i + 1}. ${item}`),
      '', 'INTERVIEW PRACTICE QUESTIONS', ...(result.interview_questions || []).map((item, i) => `${i + 1}. ${item}`),
      '', 'COURSE RECOMMENDATIONS', ...((result.course_recommendations || []).flatMap((course, i) => [
        `${i + 1}. ${course.title} — ${course.provider}`,
        `   Skills: ${(course.related_skills || []).join(', ') || 'Skill gap'}`,
        `   Course: ${normalizeCourse(course).url}`,
        ...(course.practice_questions || []).map(question => `   Practice: ${question}`),
      ])),
      '', `Analysis engine: ${result.engine || 'Local NLP'}`,
      'Note: A gap means the phrase was not found in the resume text. This score is guidance, not a hiring prediction.'
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `match-report-${(result.role || 'role').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'role'}.txt`;
    document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    toast('Report downloaded.');
  }

  function selectFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) { toast('Choose a PDF, DOCX, TXT, or MD file.'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('Resume files must be 8 MB or smaller.'); return; }
    selectedFile = file;
    $('#fileName').textContent = file.name;
    $('#fileType').textContent = ext.toUpperCase();
    $('#fileSize').textContent = `${(file.size / 1024).toFixed(file.size < 1024 * 1024 ? 0 : 1)} ${file.size < 1024 * 1024 ? 'KB' : 'MB'} · Ready to analyze`;
    $('#dropzone').hidden = true;
    $('#fileSelected').hidden = false;
    $('#formError').hidden = true;
  }

  function selectJobFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pdf', 'docx', 'txt', 'md'].includes(ext)) {
      selectedJobFile = null;
      $('#jobFile').value = '';
      $('#jobDropzone').hidden = false;
      $('#jobFileSelected').hidden = true;
      toast('Choose a PDF, DOCX, TXT, or MD file.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      selectedJobFile = null;
      $('#jobFile').value = '';
      $('#jobDropzone').hidden = false;
      $('#jobFileSelected').hidden = true;
      toast('Job description files must be 8 MB or smaller.');
      return;
    }
    selectedJobFile = file;
    $('#jobFileName').textContent = file.name;
    $('#jobFileType').textContent = ext.toUpperCase();
    $('#jobFileSize').textContent = `${(file.size / 1024).toFixed(file.size < 1024 * 1024 ? 0 : 1)} ${file.size < 1024 * 1024 ? 'KB' : 'MB'} · Ready to analyze`;
    $('#jobDropzone').hidden = true;
    $('#jobFileSelected').hidden = false;
    $('#formError').hidden = true;
  }

  function chooseSource(source) {
    activeSource = source;
    $$('.source-tab[data-source]').forEach(button => button.classList.toggle('active', button.dataset.source === source));
    $('#uploadPane').classList.toggle('active', source === 'upload');
    $('#pastePane').classList.toggle('active', source === 'paste');
    $('#formError').hidden = true;
  }

  function chooseJobSource(source) {
    activeJobSource = source;
    $$('[data-job-source]').forEach(button => button.classList.toggle('active', button.dataset.jobSource === source));
    $('#jobUploadPane').classList.toggle('active', source === 'upload');
    $('#jobPastePane').classList.toggle('active', source === 'paste');
    $('#formError').hidden = true;
  }

  function fillSettings() {
    const value = settings();
    $('#ollamaUrl').value = value.base_url;
    $('#ollamaModel').value = value.model;
  }

  function connectionMessage(text, good) {
    const el = $('#connectionMessage');
    el.textContent = text;
    el.className = `connection-message ${good ? 'good' : 'bad'}`;
    el.hidden = false;
  }

  async function testConnection() {
    const button = $('#testConnection');
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Checking…';
    try {
      const data = await api('/api/ollama/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: $('#ollamaUrl').value.trim(), model: $('#ollamaModel').value.trim() }) });
      connectionMessage(`Connected to Ollama. ${data.model} is ready.`, true);
      $('#llmHelp').textContent = `Connected · ${data.model} is ready on your computer`;
    } catch (error) { connectionMessage(error.message, false); }
    finally { button.disabled = false; button.textContent = original; }
  }

  async function loadModels() {
    const button = $('#refreshModels');
    button.disabled = true;
    const previous = button.innerHTML;
    button.textContent = 'Looking…';
    const container = $('#availableModels');
    container.hidden = true;
    try {
      const data = await api(`/api/ollama/models?base_url=${encodeURIComponent($('#ollamaUrl').value.trim())}`);
      if (!data.models.length) connectionMessage(`Ollama is running, but no models are installed. Run: ollama pull ${$('#ollamaModel').value.trim() || DEFAULT_OLLAMA_MODEL}`, false);
      else {
        container.innerHTML = data.models.map(name => `<button class="model-pill" type="button" data-model="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
        container.hidden = false;
        $$('[data-model]', container).forEach(pill => pill.addEventListener('click', () => { $('#ollamaModel').value = pill.dataset.model; container.hidden = true; }));
      }
    } catch (error) { connectionMessage(error.message, false); }
    finally { button.disabled = false; button.innerHTML = previous; }
  }

  function saveSettings() {
    const value = { base_url: $('#ollamaUrl').value.trim().replace(/\/$/, ''), model: $('#ollamaModel').value.trim() || DEFAULT_OLLAMA_MODEL };
    if (!/^https?:\/\//i.test(value.base_url)) { connectionMessage('Enter a full address beginning with http:// or https://.', false); return; }
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(value)); }
    catch { toast('Could not save settings in this browser.'); }
    closeModals();
    if ($('#llmEnabled').checked) $('#llmHelp').textContent = `Using ${value.model} · ${value.base_url}`;
    toast('Ollama settings saved on this device.');
  }

  function init() {
    setTheme(localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    const stored = settings();
    if (stored.model !== DEFAULT_OLLAMA_MODEL || stored.base_url !== 'http://127.0.0.1:11434') $('#llmHelp').textContent = `Using ${stored.model} · update connection in settings`;
    updateHistory();
    checkHealth();
    $('#analysisForm').addEventListener('submit', handleAnalyze);
    $('#themeButton').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
    $$('.nav-link[data-view],.text-link[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    $('#guideButton').addEventListener('click', () => showModal('#guideModal'));
    $('#topSettings').addEventListener('click', () => { fillSettings(); showModal('#settingsModal'); });
    $('#sideSettings').addEventListener('click', () => { fillSettings(); showModal('#settingsModal'); });
    $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    $$('.source-tab[data-source]').forEach(button => button.addEventListener('click', () => chooseSource(button.dataset.source)));
    $$('[data-job-source]').forEach(button => button.addEventListener('click', () => chooseJobSource(button.dataset.jobSource)));
    $('#resumeFile').addEventListener('change', event => selectFile(event.target.files[0]));
    $('#removeFile').addEventListener('click', () => { selectedFile = null; $('#resumeFile').value = ''; $('#dropzone').hidden = false; $('#fileSelected').hidden = true; });
    $('#jobFile').addEventListener('change', event => selectJobFile(event.target.files[0]));
    $('#removeJobFile').addEventListener('click', () => { selectedJobFile = null; $('#jobFile').value = ''; $('#jobDropzone').hidden = false; $('#jobFileSelected').hidden = true; });
    const dropzone = $('#dropzone');
    ['dragenter', 'dragover'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach(name => dropzone.addEventListener(name, event => { event.preventDefault(); dropzone.classList.remove('dragging'); }));
    dropzone.addEventListener('drop', event => selectFile(event.dataTransfer.files[0]));
    const jobDropzone = $('#jobDropzone');
    ['dragenter', 'dragover'].forEach(name => jobDropzone.addEventListener(name, event => { event.preventDefault(); jobDropzone.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach(name => jobDropzone.addEventListener(name, event => { event.preventDefault(); jobDropzone.classList.remove('dragging'); }));
    jobDropzone.addEventListener('drop', event => selectJobFile(event.dataTransfer.files[0]));
    $('#resumeText').addEventListener('input', () => $('#resumeLength').textContent = `${$('#resumeText').value.length.toLocaleString()} characters`);
    $('#jobDescription').addEventListener('input', () => $('#jobLength').textContent = `${$('#jobDescription').value.length.toLocaleString()} characters`);
    $('#sampleButton').addEventListener('click', () => {
      $('#roleInput').value = 'Product Designer';
      $('#resumeText').value = sampleResume;
      $('#jobDescription').value = sampleJob;
      $('#resumeLength').textContent = `${sampleResume.length.toLocaleString()} characters`;
      $('#jobLength').textContent = `${sampleJob.length.toLocaleString()} characters`;
      chooseSource('paste');
      chooseJobSource('paste');
      $('#resumeText').focus();
      toast('Sample resume and job description loaded.');
    });
    $('#historySearch').addEventListener('input', renderHistory);
    $('#clearHistoryButton').addEventListener('click', () => {
      if (!getHistory().length) return;
      if (!confirm('Remove all saved match reports from this device? This cannot be undone.')) return;
      saveHistory([]); renderHistory(); toast('Analysis history cleared from this device.');
    });
    $('#startFirstButton').addEventListener('click', () => switchView('workspace'));
    $('#testConnection').addEventListener('click', testConnection);
    $('#refreshModels').addEventListener('click', loadModels);
    $('#saveSettings').addEventListener('click', saveSettings);
    $$('[data-close-modal]').forEach(button => button.addEventListener('click', closeModals));
    $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) closeModals(); }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModals(); });
    document.addEventListener('click', event => {
      if (window.innerWidth <= 820 && $('#sidebar').classList.contains('open') && !$('#sidebar').contains(event.target) && !$('#menuButton').contains(event.target)) $('#sidebar').classList.remove('open');
    });
  }

  init();
})();
