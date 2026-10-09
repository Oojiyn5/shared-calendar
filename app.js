// 3단계: 일정·카테고리를 공유 서버(server.py)에 저장해서 같은 Wi-Fi의 기기끼리 함께 본다.
// 다른 기기에서 바꾼 내용은 몇 초마다 서버에 물어봐서 반영한다.

const OLD_EVENTS_KEY = 'shared-calendar-events';
const OLD_CATEGORIES_KEY = 'shared-calendar-categories';
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

// 서버가 가진 내용을 그대로 들고 있는다. 일정은 날짜 키("2026-10-09")별 배열.
let events = {};
let categories = [];
let version = -1;

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
  setOnline(true);
  return data;
}

// 서버 응답(전체 데이터)을 화면에 반영한다. 바뀐 게 없으면 다시 그리지 않는다.
function apply(data) {
  if (data.version === version) return;
  version = data.version;
  events = data.events;
  const categoriesChanged = JSON.stringify(data.categories) !== JSON.stringify(categories);
  categories = data.categories;
  // 카테고리 칸은 바뀌었을 때만 다시 그린다. 고르던 색이 몇 초마다 풀리지 않게.
  if (categoriesChanged) renderCategories();
  render();
}

function setOnline(online) {
  syncStatus.classList.toggle('offline', !online);
  syncStatus.textContent = online ? '공유 중' : '연결 끊김';
  syncStatus.title = online
    ? '같은 Wi-Fi의 기기와 일정을 함께 보고 있어요.'
    : '서버(server.py)에 연결할 수 없어요. PC에서 서버가 켜져 있는지 확인해 주세요.';
}

async function sync() {
  try {
    apply(await api('GET', '/api/data'));
  } catch {
    setOnline(false);
  }
}

// 공유 기능 전에 이 브라우저에만 저장했던 일정·카테고리를 서버로 옮긴다.
async function importOldData() {
  let oldEvents;
  let oldCategories;
  try {
    oldEvents = JSON.parse(localStorage.getItem(OLD_EVENTS_KEY));
    oldCategories = JSON.parse(localStorage.getItem(OLD_CATEGORIES_KEY));
  } catch {
    return;
  }
  if (!oldEvents && !oldCategories) return;

  apply(await api('POST', '/api/import', { events: oldEvents || {}, categories: oldCategories || [] }));
  try {
    localStorage.removeItem(OLD_EVENTS_KEY);
    localStorage.removeItem(OLD_CATEGORIES_KEY);
  } catch {
    // 지우지 못해도 서버가 같은 id는 건너뛰므로 다음에 다시 옮겨도 중복되지 않는다.
  }
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

  whileSending(addForm, async () => {
    apply(await api('POST', '/api/events', {
      date: dateKey(selected),
      event: { title, categoryId: categorySelect.value, start, end, memo: memoInput.value },
    }));
    // 같은 카테고리로 이어서 입력하기 쉽게 카테고리는 남겨 둔다.
    const keepCategory = categorySelect.value;
    addForm.reset();
    categorySelect.value = keepCategory;
    titleInput.focus();
  });
}

async function deleteEvent(id) {
  try {
    apply(await api('DELETE', `/api/events/${dateKey(selected)}/${encodeURIComponent(id)}`));
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
    const data = await api('POST', '/api/categories', { name, color });
    catForm.reset();
    apply(data);
    categorySelect.value = data.created.id; // 방금 만든 카테고리로 바로 일정을 넣을 수 있게
  });
}

async function deleteCategory(id) {
  const cat = categories.find((c) => c.id === id);
  if (!confirm(`'${cat.name}' 카테고리를 지울까요?\n이 카테고리의 일정은 지워지지 않고 '카테고리 없음'이 돼요.\n다른 기기에서도 함께 지워져요.`)) return;
  try {
    apply(await api('DELETE', `/api/categories/${encodeURIComponent(id)}`));
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

renderCategories();
render();
importOldData().catch(() => {}).finally(() => {
  sync();
  setInterval(() => {
    if (document.visibilityState === 'visible') sync();
  }, SYNC_INTERVAL);
});
