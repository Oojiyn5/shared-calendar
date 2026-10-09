// 4단계: 휴대폰 홈 화면에 설치하는 앱(PWA).
// 공유 서버(server.py)에 연결되면 같은 Wi-Fi의 기기끼리 일정을 함께 보고,
// 서버가 없는 곳(GitHub Pages, 오프라인)에서는 이 기기에만 저장한다.
// 이 기기에 저장한 일정은 나중에 서버에 연결되면 서버로 옮긴다.

const LOCAL_EVENTS_KEY = 'shared-calendar-events';
const LOCAL_CATEGORIES_KEY = 'shared-calendar-categories';
const SERVER_COPY_KEY = 'shared-calendar-server-copy';
const SYNC_INTERVAL = 3000;
const PALETTE = ['#1f8a5b', '#3b6fd8', '#d64545', '#e08a1e', '#8a4fd6', '#d6458f', '#1a9aa8', '#8a6a45'];
const NO_CATEGORY_COLOR = '#9aa59f';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const grid = document.getElementById('calendarGrid');
const monthTitle = document.getElementById('monthTitle');
const dayLabel = document.getElementById('dayLabel');
const dayCount = document.getElementById('dayCount');
const eventList = document.getElementById('eventList');
const addForm = document.getElementById('addForm');
const titleInput = document.getElementById('eventTitle');
const categorySelect = document.getElementById('eventCategory');
const startInput = document.getElementById('eventStart');
const endInput = document.getElementById('eventEnd');
const memoInput = document.getElementById('eventMemo');
const catList = document.getElementById('catList');
const catForm = document.getElementById('catForm');
const catNameInput = document.getElementById('catName');
const swatches = document.getElementById('swatches');
const syncStatus = document.getElementById('syncStatus');

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selected = new Date(viewYear, viewMonth, today.getDate());

// 지금 보이는 내용. 일정은 날짜 키("2026-10-09")별 배열.
let events = {};
let categories = [];
let version = -1;
// 'server': 공유 서버에 저장
// 'offline': 서버를 쓰던 기기인데 지금 연결이 안 됨 → 마지막으로 받은 내용을 보기만 한다
// 'local': 서버가 없는 곳 → 이 기기(localStorage)에 저장
let mode = 'server';

// 주소는 'api/…'처럼 상대 경로로 써야 GitHub Pages처럼 하위 폴더에 올려도 맞는 곳을 찾는다.
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
  setStatus('server');
  return data;
}

// 전체 데이터를 화면에 반영한다. 바뀐 게 없으면 다시 그리지 않는다.
function apply(data) {
  if (data.version === version) return;
  version = data.version;
  events = data.events;
  const categoriesChanged = JSON.stringify(data.categories) !== JSON.stringify(categories);
  categories = data.categories;
  // 카테고리 칸은 바뀌었을 때만 다시 그린다. 고르던 색이 몇 초마다 풀리지 않게.
  if (categoriesChanged) renderCategories();
  render();
  // 서버 내용을 복사해 두었다가 연결이 끊겼을 때 보여 준다.
  if (mode === 'server') {
    try {
      localStorage.setItem(SERVER_COPY_KEY, JSON.stringify(data));
    } catch {
      // 복사해 두지 못해도 앱은 그대로 쓸 수 있다.
    }
  }
}

const STATUS = {
  server: ['공유 중', '같은 Wi-Fi의 기기와 일정을 함께 보고 있어요.'],
  offline: ['연결 끊김', '서버(server.py)에 연결할 수 없어서 마지막으로 받은 일정을 보여 주고 있어요. PC에서 서버를 켜면 다시 고칠 수 있어요.'],
  local: ['이 기기에 저장', '공유 서버가 없어서 이 기기에만 저장해요. 나중에 서버에 연결하면 서버로 옮겨요.'],
};

function setStatus(state) {
  syncStatus.className = `sync ${state}`;
  [syncStatus.textContent, syncStatus.title] = STATUS[state];
}

async function sync() {
  if (mode === 'local') return;
  try {
    const data = await api('GET', 'api/data');
    mode = 'server'; // 끊겼다가 다시 연결되면 고칠 수 있게 된다
    apply(data);
  } catch {
    setStatus('offline');
  }
}

function readLocal() {
  try {
    return {
      events: JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY)),
      categories: JSON.parse(localStorage.getItem(LOCAL_CATEGORIES_KEY)),
    };
  } catch {
    return { events: null, categories: null };
  }
}

function writeLocal() {
  try {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
    localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(categories));
  } catch {
    // 저장이 막힌 환경(사생활 보호 모드 등)에서는 화면에만 남긴다.
  }
}

// 이 기기에만 저장했던 일정·카테고리를 서버로 옮긴다.
async function importLocalData() {
  const local = readLocal();
  if (!local.events && !local.categories) return;

  apply(await api('POST', 'api/import', { events: local.events || {}, categories: local.categories || [] }));
  try {
    localStorage.removeItem(LOCAL_EVENTS_KEY);
    localStorage.removeItem(LOCAL_CATEGORIES_KEY);
  } catch {
    // 지우지 못해도 서버가 같은 id는 건너뛰므로 다음에 다시 옮겨도 중복되지 않는다.
  }
}

// 바꾸는 작업 하나를 서버 또는 이 기기에 적용한다.
// 서버는 바뀐 전체 데이터를 돌려주고, 이 기기 모드에서는 localEdit이 직접 고친다.
async function change(serverCall, localEdit) {
  if (mode === 'offline') {
    throw new Error('서버에 연결되지 않아서 지금은 일정을 보기만 할 수 있어요. PC에서 서버를 켜 주세요.');
  }
  if (mode === 'server') {
    const data = await serverCall();
    apply(data);
    return data;
  }
  const data = { events: structuredClone(events), categories: structuredClone(categories), version: version + 1 };
  const created = localEdit(data);
  apply(data);
  writeLocal();
  return { created };
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function sortDay(list) {
  // 하루 종일 일정이 먼저, 그다음 시작 시간 순.
  list.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}

function showError(err) {
  alert(err.message === 'Failed to fetch' || err.name === 'TypeError'
    ? '서버에 연결할 수 없어서 저장하지 못했어요.'
    : err.message);
  sync();
}

function dateKey(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function sameDay(a, b) {
  return dateKey(a) === dateKey(b);
}

function eventsOn(d) {
  return events[dateKey(d)] || [];
}

function categoryOf(ev) {
  return categories.find((c) => c.id === ev.categoryId);
}

function colorOf(ev) {
  const cat = categoryOf(ev);
  return cat ? cat.color : NO_CATEGORY_COLOR;
}

function renderCalendar() {
  monthTitle.textContent = `${viewYear}년 ${viewMonth + 1}월`;
  grid.innerHTML = '';

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    // 달 범위를 벗어난 칸도 Date가 알아서 이전·다음 달로 넘겨 준다.
    const date = new Date(viewYear, viewMonth, i - firstDay + 1);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day';
    cell.setAttribute('aria-label', `${date.getMonth() + 1}월 ${date.getDate()}일`);

    if (date.getMonth() !== viewMonth) cell.classList.add('other');
    if (sameDay(date, today)) cell.classList.add('today');
    if (sameDay(date, selected)) cell.classList.add('selected');

    cell.innerHTML = `<span class="num">${date.getDate()}</span>`;
    // 점은 일정의 카테고리 색으로, 최대 3개까지 찍는다.
    const list = eventsOn(date).slice(0, 3);
    if (list.length > 0) {
      const dots = document.createElement('span');
      dots.className = 'dots';
      list.forEach((ev) => {
        const dot = document.createElement('i');
        dot.style.background = colorOf(ev);
        dots.appendChild(dot);
      });
      cell.appendChild(dots);
    }

    cell.addEventListener('click', () => selectDate(date));
    grid.appendChild(cell);
  }
}

function renderDayPanel() {
  const list = eventsOn(selected);
  dayLabel.textContent = `${selected.getMonth() + 1}월 ${selected.getDate()}일 ${WEEKDAYS[selected.getDay()]}요일`;
  dayCount.textContent = `일정 ${list.length}개`;
  eventList.innerHTML = '';

  if (list.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = '일정이 없어요.';
    eventList.appendChild(empty);
    return;
  }

  list.forEach((ev) => {
    const li = document.createElement('li');
    li.className = 'event';

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.setProperty('--c', colorOf(ev));

    // 사용자가 입력한 글자는 textContent로만 넣는다.
    const body = document.createElement('div');
    body.className = 'event-body';
    const title = document.createElement('p');
    title.className = 'event-title';
    title.textContent = ev.title;
    const meta = document.createElement('p');
    meta.className = 'event-time';
    meta.textContent = formatTime(ev);
    const cat = categoryOf(ev);
    if (cat) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.style.setProperty('--c', cat.color);
      tag.textContent = cat.name;
      meta.prepend(tag);
    }
    body.append(title, meta);
    if (ev.memo) {
      const memo = document.createElement('p');
      memo.className = 'event-memo';
      memo.textContent = ev.memo;
      body.appendChild(memo);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del-btn';
    del.setAttribute('aria-label', `${ev.title} 삭제`);
    del.textContent = '×';
    del.addEventListener('click', () => deleteEvent(ev.id));

    li.append(dot, body, del);
    eventList.appendChild(li);
  });
}

function formatTime(ev) {
  if (!ev.start) return '하루 종일';
  return ev.end ? `${ev.start} – ${ev.end}` : ev.start;
}

function renderCategories() {
  // 일정 입력 칸의 선택 목록. 고르던 값은 유지한다.
  const current = categorySelect.value;
  categorySelect.innerHTML = '';
  categorySelect.add(new Option('카테고리 없음', ''));
  categories.forEach((c) => categorySelect.add(new Option(c.name, c.id)));
  categorySelect.value = categories.some((c) => c.id === current) ? current : '';

  // 카테고리 목록(색 범례 겸 삭제 버튼)
  catList.innerHTML = '';
  if (categories.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'cat-empty';
    empty.textContent = '카테고리를 만들어 일정을 색으로 나눠 보세요.';
    catList.appendChild(empty);
  }
  categories.forEach((c) => {
    const li = document.createElement('li');
    li.className = 'chip';
    li.style.setProperty('--c', c.color);
    const name = document.createElement('span');
    name.textContent = c.name;
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'chip-del';
    del.setAttribute('aria-label', `${c.name} 카테고리 삭제`);
    del.textContent = '×';
    del.addEventListener('click', () => deleteCategory(c.id));
    li.append(name, del);
    catList.appendChild(li);
  });

  // 색 고르기: 아직 안 쓴 색을 기본으로 고른다.
  const used = new Set(categories.map((c) => c.color));
  const pick = PALETTE.find((p) => !used.has(p)) || PALETTE[0];
  swatches.innerHTML = '';
  PALETTE.forEach((color, i) => {
    const label = document.createElement('label');
    label.className = 'swatch';
    label.style.setProperty('--c', color);
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'catColor';
    radio.value = color;
    radio.checked = color === pick;
    radio.setAttribute('aria-label', `색 ${i + 1}`);
    label.appendChild(radio);
    swatches.appendChild(label);
  });
}

function render() {
  renderCalendar();
  renderDayPanel();
}

function selectDate(date) {
  selected = date;
  viewYear = date.getFullYear();
  viewMonth = date.getMonth();
  render();
}

// 저장하는 동안 버튼을 잠가서 두 번 눌러도 한 번만 들어가게 한다.
async function whileSending(form, task) {
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await task();
  } catch (err) {
    showError(err);
  } finally {
    button.disabled = false;
  }
}

function addEvent(e) {
  e.preventDefault();
  const title = titleInput.value.trim();
  const start = startInput.value;
  const end = endInput.value;

  if (!title) {
    titleInput.value = '';
    titleInput.focus();
    return;
  }
  if (start && end && end < start) {
    endInput.setCustomValidity('끝 시간은 시작 시간보다 늦어야 해요.');
    endInput.reportValidity();
    return;
  }

  const date = dateKey(selected);
  const event = { title, categoryId: categorySelect.value, start, end: start ? end : '', memo: memoInput.value.trim() };
  whileSending(addForm, async () => {
    await change(
      () => api('POST', 'api/events', { date, event }),
      (data) => {
        const list = data.events[date] || [];
        list.push({ id: newId(), ...event });
        sortDay(list);
        data.events[date] = list;
      },
    );
    // 같은 카테고리로 이어서 입력하기 쉽게 카테고리는 남겨 둔다.
    const keepCategory = categorySelect.value;
    addForm.reset();
    categorySelect.value = keepCategory;
    titleInput.focus();
  });
}

async function deleteEvent(id) {
  const date = dateKey(selected);
  try {
    await change(
      () => api('DELETE', `api/events/${date}/${encodeURIComponent(id)}`),
      (data) => {
        data.events[date] = (data.events[date] || []).filter((ev) => ev.id !== id);
        if (data.events[date].length === 0) delete data.events[date];
      },
    );
  } catch (err) {
    showError(err);
  }
}

function addCategory(e) {
  e.preventDefault();
  const name = catNameInput.value.trim();
  if (!name) {
    catNameInput.value = '';
    catNameInput.focus();
    return;
  }
  if (categories.some((c) => c.name === name)) {
    catNameInput.setCustomValidity('이미 있는 카테고리예요.');
    catNameInput.reportValidity();
    return;
  }

  const color = swatches.querySelector('input:checked')?.value || PALETTE[0];
  whileSending(catForm, async () => {
    const { created } = await change(
      () => api('POST', 'api/categories', { name, color }),
      (data) => {
        const cat = { id: newId(), name, color };
        data.categories.push(cat);
        return cat;
      },
    );
    catForm.reset();
    renderCategories(); // 다음 카테고리용으로 안 쓴 색을 다시 골라 둔다
    categorySelect.value = created.id; // 방금 만든 카테고리로 바로 일정을 넣을 수 있게
  });
}

async function deleteCategory(id) {
  const cat = categories.find((c) => c.id === id);
  const others = mode === 'server' ? '\n다른 기기에서도 함께 지워져요.' : '';
  if (!confirm(`'${cat.name}' 카테고리를 지울까요?\n이 카테고리의 일정은 지워지지 않고 '카테고리 없음'이 돼요.${others}`)) return;
  try {
    await change(
      () => api('DELETE', `api/categories/${encodeURIComponent(id)}`),
      (data) => {
        data.categories = data.categories.filter((c) => c.id !== id);
        // 카테고리를 지워도 일정은 남기고 '카테고리 없음'으로 바꾼다.
        Object.values(data.events).forEach((list) => list.forEach((ev) => {
          if (ev.categoryId === id) ev.categoryId = '';
        }));
      },
    );
  } catch (err) {
    showError(err);
  }
}

document.getElementById('prevMonth').addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});
document.getElementById('nextMonth').addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});
document.getElementById('todayBtn').addEventListener('click', () => {
  selectDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
});
endInput.addEventListener('input', () => endInput.setCustomValidity(''));
startInput.addEventListener('input', () => endInput.setCustomValidity(''));
catNameInput.addEventListener('input', () => catNameInput.setCustomValidity(''));
addForm.addEventListener('submit', addEvent);
catForm.addEventListener('submit', addCategory);
// 휴대폰에서 다른 앱을 보다가 돌아오면 바로 새 내용을 받아온다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sync();
});

// 앱을 열 때 공유 서버가 있는지 보고 저장할 곳을 정한다.
async function start() {
  renderCategories();
  render();
  try {
    apply(await api('GET', 'api/data'));
    await importLocalData().catch(() => {});
  } catch {
    let copy = null;
    try {
      copy = JSON.parse(localStorage.getItem(SERVER_COPY_KEY));
    } catch {
      // 복사본이 없으면 아래에서 이 기기 모드로 간다.
    }
    if (!copy) {
      // 서버를 쓴 적이 없는 곳(GitHub Pages 등) → 이 기기에 저장한다.
      mode = 'local';
      const local = readLocal();
      apply({ events: local.events || {}, categories: local.categories || [], version: 0 });
      setStatus('local');
      return;
    }
    // 서버를 쓰던 기기인데 지금 연결이 안 된다 → 복사본을 보여 주고, 서버가 돌아오는지 계속 확인한다.
    mode = 'offline';
    apply(copy);
    setStatus('offline');
  }
  setInterval(() => {
    if (document.visibilityState === 'visible') sync();
  }, SYNC_INTERVAL);
}

start();

// 홈 화면에 설치할 수 있게 하고, 인터넷이 없어도 앱이 열리게 한다.
// (HTTPS 주소나 localhost에서만 동작한다.)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
