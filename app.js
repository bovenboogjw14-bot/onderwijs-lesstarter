const params = new URLSearchParams(window.location.search);
const demoMode = params.get('demo') === '1';
const viewMode = params.get('view') || 'selector';
const manifestPath = demoMode ? './data/manifest.demo.json' : './data/manifest.json';
const storageKey = 'onderwijs-lesstarter-selection-v1';

const els = {
  subject: document.querySelector('#subjectSelect'),
  lesson: document.querySelector('#lessonSelect'),
  sourceCard: document.querySelector('#sourceCard'),
  sourceRanges: document.querySelector('#sourceRanges'),
  status: document.querySelector('#status'),
  start: document.querySelector('#startButton'),
  selectorView: document.querySelector('#selectorView'),
  lessonView: document.querySelector('#lessonView'),
  lessonFrame: document.querySelector('#lessonFrame'),
  activeLessonTitle: document.querySelector('#activeLessonTitle'),
  activeSubjectTitle: document.querySelector('#activeSubjectTitle'),
  back: document.querySelector('#backButton')
};

let manifest = { subjects: [] };

function setStatus(message) { els.status.textContent = message || ''; }
function getSubjectById(subjectId) { return manifest.subjects.find(s => s.id === subjectId) || null; }
function getLessonByIds(subjectId, lessonId) {
  const subject = getSubjectById(subjectId);
  const lesson = subject?.lessons?.find(l => l.id === lessonId) || null;
  return { subject, lesson };
}
function getSubject() { return getSubjectById(els.subject.value); }
function getLesson() {
  const subject = getSubject();
  return subject?.lessons?.find(l => l.id === els.lesson.value) || null;
}
function option(value, label) {
  const node = document.createElement('option');
  node.value = value;
  node.textContent = label;
  return node;
}
function formatRange(range) {
  const parts = [];
  if (range.source) parts.push(range.source);
  if (range.chapter) parts.push(`Hoofdstuk ${range.chapter}`);
  if (range.paragraphFrom || range.paragraphTo) {
    const from = range.paragraphFrom || range.paragraphTo;
    const to = range.paragraphTo || range.paragraphFrom;
    parts.push(from === to ? `§ ${from}` : `§ ${from} t/m § ${to}`);
  }
  if (range.pageFrom || range.pageTo) {
    const from = range.pageFrom || range.pageTo;
    const to = range.pageTo || range.pageFrom;
    parts.push(from === to ? `pagina ${from}` : `pagina ${from} t/m ${to}`);
  }
  return parts.join(' · ');
}
function renderSources(lesson) {
  els.sourceRanges.replaceChildren();
  const ranges = Array.isArray(lesson?.sourceRanges) ? lesson.sourceRanges : [];
  els.sourceCard.hidden = ranges.length === 0;
  ranges.forEach(range => {
    const p = document.createElement('p');
    p.textContent = formatRange(range);
    els.sourceRanges.appendChild(p);
  });
}
function renderLessons(subject, selectedLessonId = '') {
  els.lesson.replaceChildren();
  els.lesson.appendChild(option('', subject ? 'Kies een les…' : 'Kies eerst een vak…'));
  const lessons = subject?.lessons || [];
  lessons.forEach(lesson => {
    const label = lesson.title ? `${lesson.label || lesson.id} — ${lesson.title}` : (lesson.label || lesson.id);
    els.lesson.appendChild(option(lesson.id, label));
  });
  els.lesson.disabled = lessons.length === 0;
  els.lesson.value = lessons.some(l => l.id === selectedLessonId) ? selectedLessonId : '';
  els.start.disabled = true;
  renderSources(null);
  setStatus(subject && lessons.length === 0 ? 'Voor dit vak zijn nog geen beschikbare lessen gepubliceerd.' : '');
}
function saveSelection(subject, lesson) {
  if (!subject || !lesson) return;
  localStorage.setItem(storageKey, JSON.stringify({ subjectId: subject.id, lessonId: lesson.id }));
}
function loadSavedSelection() {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); }
  catch { return {}; }
}
function allowedGammaUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'gamma.app' || host.endsWith('.gamma.app'));
  } catch { return false; }
}
function showLesson(subject, lesson, save = true) {
  const embedUrl = lesson.gammaEmbedUrl || lesson.launchUrl;
  if (!embedUrl || !allowedGammaUrl(embedUrl)) {
    els.selectorView.hidden = false;
    els.lessonView.hidden = true;
    setStatus('Deze les heeft geen geldige Gamma-presentatie gekoppeld.');
    return false;
  }
  if (save) saveSelection(subject, lesson);
  els.activeLessonTitle.textContent = lesson.title ? `${lesson.label || lesson.id} — ${lesson.title}` : (lesson.label || lesson.id);
  els.activeSubjectTitle.textContent = subject.name;
  els.lessonFrame.src = embedUrl;
  els.selectorView.hidden = true;
  els.lessonView.hidden = false;
  return true;
}
function openSavedLessonView() {
  const saved = loadSavedSelection();
  const { subject, lesson } = getLessonByIds(saved.subjectId, saved.lessonId);
  if (!subject || !lesson) {
    els.selectorView.hidden = false;
    els.lessonView.hidden = true;
    setStatus('Kies eerst een vak en les op het startscherm.');
    return;
  }
  showLesson(subject, lesson, false);
}
async function init() {
  try {
    const response = await fetch(manifestPath, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    manifest = await response.json();
    const subjects = Array.isArray(manifest.subjects) ? manifest.subjects : [];
    subjects.forEach(subject => els.subject.appendChild(option(subject.id, subject.name)));
    if (subjects.length === 0) { setStatus('Er zijn nog geen vakken in het manifest opgenomen.'); return; }
    if (viewMode === 'lesson') { openSavedLessonView(); return; }
    const saved = loadSavedSelection();
    if (subjects.some(s => s.id === saved.subjectId)) {
      els.subject.value = saved.subjectId;
      const subject = getSubject();
      renderLessons(subject, saved.lessonId);
      if (saved.lessonId) els.lesson.dispatchEvent(new Event('change'));
    }
    if (demoMode) setStatus('DEMOMODUS — deze gegevens zijn uitsluitend voor technische test.');
  } catch (error) {
    console.error(error);
    setStatus('Lesstarter kon het lesmanifest niet laden.');
  }
}
els.subject.addEventListener('change', () => { renderLessons(getSubject()); });
els.lesson.addEventListener('change', () => {
  const subject = getSubject();
  const lesson = getLesson();
  renderSources(lesson);
  els.start.disabled = !lesson;
  if (lesson) saveSelection(subject, lesson);
});
els.start.addEventListener('click', () => {
  const subject = getSubject();
  const lesson = getLesson();
  if (subject && lesson) showLesson(subject, lesson);
});
els.back.addEventListener('click', () => {
  els.lessonFrame.src = 'about:blank';
  els.lessonView.hidden = true;
  els.selectorView.hidden = false;
});
window.addEventListener('storage', event => {
  if (event.key === storageKey && viewMode === 'lesson') openSavedLessonView();
});
init();
