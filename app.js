const params = new URLSearchParams(window.location.search);
const demoMode = params.get('demo') === '1';
const rawView = params.get('view') || 'selector';
const viewMode = rawView === 'lesson' ? 'theory' : rawView;
const manifestPath = demoMode ? './data/manifest.demo.json' : './data/manifest.json';
const storageKey = 'onderwijs-lesstarter-active-v2';
const drawingStorageKey = 'onderwijs-lesstarter-drawing-v1';
const legacyStorageKey = 'onderwijs-lesstarter-selection-v1';

const els = {
  subject: document.querySelector('#subjectSelect'),
  lesson: document.querySelector('#lessonSelect'),
  sourceCard: document.querySelector('#sourceCard'),
  sourceRanges: document.querySelector('#sourceRanges'),
  status: document.querySelector('#status'),
  start: document.querySelector('#startButton'),
  selectorView: document.querySelector('#selectorView'),
  messageView: document.querySelector('#messageView'),
  messageText: document.querySelector('#messageText'),
  lessonView: document.querySelector('#lessonView'),
  lessonFrame: document.querySelector('#lessonFrame'),
  activeLessonTitle: document.querySelector('#activeLessonTitle'),
  activeSubjectTitle: document.querySelector('#activeSubjectTitle'),
  drawingWrap: document.querySelector('#drawingSelectorWrap'),
  drawing: document.querySelector('#drawingSelect'),
  back: document.querySelector('#backButton')
};

let manifest = { subjects: [] };
let activeSelection = {};
let activeDrawingContext = null;

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
  renderSources(getLesson());
  refreshStartState();
}
function clearActiveSelection() {
  sessionStorage.removeItem(storageKey);
  activeSelection = {};
}
function saveActiveSelection(subject, lesson) {
  if (!subject || !lesson) return;
  activeSelection = { subjectId: subject.id, lessonId: lesson.id };
  sessionStorage.setItem(storageKey, JSON.stringify(activeSelection));
}
function loadActiveSelection() {
  try { return JSON.parse(sessionStorage.getItem(storageKey) || '{}'); }
  catch { return {}; }
}
function loadDrawingSelection() {
  try { return JSON.parse(sessionStorage.getItem(drawingStorageKey) || '{}'); }
  catch { return {}; }
}
function saveDrawingSelection(subjectId, lessonId, drawingId) {
  sessionStorage.setItem(drawingStorageKey, JSON.stringify({ subjectId, lessonId, drawingId }));
}
function currentChoiceIsActive() {
  return Boolean(
    els.subject.value &&
    els.lesson.value &&
    els.subject.value === activeSelection.subjectId &&
    els.lesson.value === activeSelection.lessonId
  );
}
function refreshStartState() {
  const lesson = getLesson();
  if (!lesson) {
    els.start.disabled = true;
    els.start.textContent = 'Start les';
    if (getSubject() && (getSubject().lessons || []).length === 0) {
      setStatus('Voor dit vak zijn nog geen beschikbare lessen gepubliceerd.');
    } else {
      setStatus('');
    }
    return;
  }

  if (currentChoiceIsActive()) {
    els.start.disabled = true;
    els.start.textContent = 'Les gestart ✓';
    setStatus('Deze les is actief. Ga naar dia 2 voor theorie, dia 3 voor praktijk of dia 4 voor werktekeningen.');
  } else {
    els.start.disabled = false;
    els.start.textContent = 'Start les';
    setStatus('Klik op Start les om deze keuze actief te maken.');
  }
}
function invalidateActiveIfChoiceChanged() {
  if (!activeSelection.subjectId || !activeSelection.lessonId) return;
  if (!currentChoiceIsActive()) clearActiveSelection();
}
function allowedGammaUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && (host === 'gamma.app' || host.endsWith('.gamma.app'));
  } catch { return false; }
}
function normalizedPdfUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    const sameOrigin = url.origin === window.location.origin;
    const pdfPath = /\.pdf$/i.test(url.pathname);
    return url.protocol === 'https:' && sameOrigin && pdfPath ? url.href : null;
  } catch { return null; }
}
function showMessage(message) {
  els.selectorView.hidden = true;
  els.lessonView.hidden = true;
  els.drawingWrap.hidden = true;
  activeDrawingContext = null;
  els.messageText.textContent = message;
  els.messageView.hidden = false;
}
function showSelectionRequired() {
  showMessage('Kies vak en les op dia 1.');
}
function presentationForView(lesson, view) {
  if (view === 'practice') {
    return lesson?.presentations?.practiceTeacher || null;
  }
  if (view === 'theory') {
    if (lesson?.presentations?.theory) return lesson.presentations.theory;
    const legacyUrl = lesson?.gammaEmbedUrl || lesson?.launchUrl;
    return legacyUrl ? { provider: 'gamma', embedUrl: legacyUrl } : null;
  }
  return null;
}
function missingPresentationMessage(view) {
  if (view === 'practice') return 'Voor deze les is nog geen praktijkpresentatie gekoppeld.';
  return 'Voor deze les is nog geen theoriepresentatie gekoppeld.';
}
function showPresentation(subject, lesson, view) {
  const presentation = presentationForView(lesson, view);
  const embedUrl = presentation?.embedUrl || presentation?.url;
  if (!embedUrl || !allowedGammaUrl(embedUrl)) {
    showMessage(missingPresentationMessage(view));
    return false;
  }
  els.activeLessonTitle.textContent = lesson.title ? `${lesson.label || lesson.id} — ${lesson.title}` : (lesson.label || lesson.id);
  els.activeSubjectTitle.textContent = view === 'practice' ? `${subject.name} · Praktijk` : `${subject.name} · Theorie`;
  els.drawingWrap.hidden = true;
  activeDrawingContext = null;
  els.lessonFrame.title = view === 'practice' ? 'Praktijkdocentenpresentatie' : 'Theoriepresentatie';
  els.lessonFrame.src = embedUrl;
  els.messageView.hidden = true;
  els.selectorView.hidden = true;
  els.lessonView.hidden = false;
  return true;
}
function drawingsForLesson(lesson) {
  const drawings = Array.isArray(lesson?.documents?.technicalDrawings) ? lesson.documents.technicalDrawings : [];
  return drawings
    .map((drawing, index) => ({
      id: drawing.id || `drawing-${index + 1}`,
      title: drawing.title || `Werktekening ${index + 1}`,
      version: drawing.version || '',
      pdfUrl: normalizedPdfUrl(drawing.pdfUrl || drawing.url || '')
    }))
    .filter(drawing => drawing.pdfUrl);
}
function openDrawingById(drawingId) {
  if (!activeDrawingContext) return;
  const drawing = activeDrawingContext.drawings.find(item => item.id === drawingId) || activeDrawingContext.drawings[0];
  if (!drawing) return;
  els.drawing.value = drawing.id;
  els.lessonFrame.title = drawing.title;
  els.lessonFrame.src = drawing.pdfUrl;
  saveDrawingSelection(activeDrawingContext.subjectId, activeDrawingContext.lessonId, drawing.id);
}
function showDrawing(subject, lesson) {
  const drawings = drawingsForLesson(lesson);
  if (drawings.length === 0) {
    showMessage('Voor deze les is nog geen technische tekening gekoppeld.');
    return false;
  }

  els.activeLessonTitle.textContent = lesson.title ? `${lesson.label || lesson.id} — ${lesson.title}` : (lesson.label || lesson.id);
  els.activeSubjectTitle.textContent = `${subject.name} · Werktekening`;
  els.drawing.replaceChildren();
  drawings.forEach(drawing => {
    const version = drawing.version ? ` · v${drawing.version}` : '';
    els.drawing.appendChild(option(drawing.id, `${drawing.title}${version}`));
  });
  els.drawingWrap.hidden = drawings.length <= 1;
  activeDrawingContext = { subjectId: subject.id, lessonId: lesson.id, drawings };

  const stored = loadDrawingSelection();
  const storedId = stored.subjectId === subject.id && stored.lessonId === lesson.id ? stored.drawingId : '';
  const initial = drawings.some(item => item.id === storedId) ? storedId : drawings[0].id;

  els.messageView.hidden = true;
  els.selectorView.hidden = true;
  els.lessonView.hidden = false;
  openDrawingById(initial);
  return true;
}
function openActiveContentView() {
  activeSelection = loadActiveSelection();
  const { subject, lesson } = getLessonByIds(activeSelection.subjectId, activeSelection.lessonId);
  if (!subject || !lesson) {
    showSelectionRequired();
    return;
  }
  if (viewMode === 'drawing') {
    showDrawing(subject, lesson);
    return;
  }
  showPresentation(subject, lesson, viewMode);
}
function restoreSelectorFromActive() {
  activeSelection = loadActiveSelection();
  const { subject, lesson } = getLessonByIds(activeSelection.subjectId, activeSelection.lessonId);
  if (!subject || !lesson) {
    activeSelection = {};
    els.subject.value = '';
    renderLessons(null);
    return;
  }
  els.subject.value = subject.id;
  renderLessons(subject, lesson.id);
  renderSources(lesson);
  refreshStartState();
}
async function init() {
  try {
    localStorage.removeItem(legacyStorageKey);
    const response = await fetch(manifestPath, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`manifest ${response.status}`);
    manifest = await response.json();
    const subjects = Array.isArray(manifest.subjects) ? manifest.subjects : [];
    subjects.forEach(subject => els.subject.appendChild(option(subject.id, subject.name)));
    if (subjects.length === 0) { setStatus('Er zijn nog geen vakken in het manifest opgenomen.'); return; }

    if (viewMode === 'theory' || viewMode === 'practice' || viewMode === 'drawing') {
      els.back.hidden = true;
      openActiveContentView();
      return;
    }

    els.messageView.hidden = true;
    els.selectorView.hidden = false;
    restoreSelectorFromActive();
    if (demoMode && !activeSelection.subjectId) {
      setStatus('DEMOMODUS — kies vak en les en klik daarna op Start les.');
    }
  } catch (error) {
    console.error(error);
    setStatus('Lesstarter kon het lesmanifest niet laden.');
  }
}
els.subject.addEventListener('change', () => {
  invalidateActiveIfChoiceChanged();
  renderLessons(getSubject());
});
els.lesson.addEventListener('change', () => {
  invalidateActiveIfChoiceChanged();
  renderSources(getLesson());
  refreshStartState();
});
els.start.addEventListener('click', () => {
  const subject = getSubject();
  const lesson = getLesson();
  if (!subject || !lesson) return;
  saveActiveSelection(subject, lesson);
  refreshStartState();
});
els.drawing.addEventListener('change', () => openDrawingById(els.drawing.value));
els.back.addEventListener('click', () => {
  els.lessonFrame.src = 'about:blank';
  els.lessonView.hidden = true;
  els.messageView.hidden = true;
  els.drawingWrap.hidden = true;
  activeDrawingContext = null;
  els.selectorView.hidden = false;
  restoreSelectorFromActive();
});
window.addEventListener('storage', event => {
  if (event.storageArea === sessionStorage && event.key === storageKey && (viewMode === 'theory' || viewMode === 'practice' || viewMode === 'drawing')) {
    openActiveContentView();
  }
});
init();
