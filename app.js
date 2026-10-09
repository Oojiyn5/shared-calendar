// 5단계: Firebase로 기기끼리 일정 공유.
// firebase-config.js에 설정값이 있으면 Google로 로그인해서 Firestore에 저장한다.
// 허용 목록(Firestore의 members)에 있는 계정만 볼 수 있고, 인터넷이 끊겨도 보고 고칠 수 있다
// (다시 연결되면 Firebase가 알아서 올린다).
// 설정값이 없으면 이 기기(localStorage)에만 저장한다.

import { firebaseConfig, CALENDAR_ID } from './firebase-config.js';

const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const LOCAL_EVENTS_KEY = 'shared-calendar-events';
const LOCAL_CATEGORIES_KEY = 'shared-calendar-categories';
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
const calendarApp = document.getElementById('calendarApp');
const authPanel = document.getElementById('authPanel');
const authMessage = document.getElementById('authMessage');
const signInBtn = document.getElementById('signInBtn');
const switchAccountBtn = document.getElementById('switchAccountBtn');
const signOutBtn = document.getElementById('signOutBtn');
const todayBtn = document.getElementById('todayBtn');

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selected = new Date(viewYear, viewMonth, today.getDate());

// 지금 보이는 내용. 일정은 날짜 키("2026-10-09")별 배열.
let events = {};
let categories = [];
// 저장하는 곳. localStore 또는 Firebase에 로그인한 뒤 만드는 firebaseStore.
let store = null;

const STATUS = {
  synced: ['', '공유 중', '로그인한 기기끼리 일정을 함께 보고 있어요.'],
  saving: ['', '저장 중…', 'Firebase에 올리고 있어요.'],
  connecting: ['wait', '연결 중…', 'Firebase에 연결하고 있어요.'],
  offline: ['offline', '오프라인', '인터넷이 없어도 보고 고칠 수 있어요. 다시 연결되면 자동으로 올라가요.'],
  signedOut: ['wait', '로그인 필요', 'Google 계정으로 로그인해 주세요.'],
  local: ['local', '이 기기에 저장', 'Firebase 설정이 없어서 이 기기에만 저장해요.'],
};

function setStatus(state) {
  const [cls, text, title] = STATUS[state];
  syncStatus.className = `sync ${cls}`.trim();
  syncStatus.textContent = text;
  syncStatus.title = title;
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function sortDay(list) {
  // 하루 종일 일정이 먼저, 그다음 시작 시간 순.
  list.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
}

function showError(err) {
  console.error(err);
  alert(err.code === 'permission-denied'
    ? '저장할 권한이 없어요. 허용 목록에 등록된 계정인지 확인해 주세요.'
    : `저장하지 못했어요. (${err.message})`);
}

// 카테고리는 바뀌었을 때만 다시 그린다. 고르던 색이 풀리지 않게.
function setData(nextEvents, nextCategories) {
  events = nextEvents;
  if (JSON.stringify(nextCategories) !== JSON.stringify(categories)) {
    categories = nextCategories;
    renderCategories();
  }
  render();
}

// ---------- 이 기기에 저장 (Firebase 설정이 없을 때) ----------

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

function clearLocal() {
  try {
    localStorage.removeItem(LOCAL_EVENTS_KEY);
    localStorage.removeItem(LOCAL_CATEGORIES_KEY);
  } catch {
    // 지우지 못해도 같은 id는 다시 옮기지 않으므로 겹치지 않는다.
  }
}

function localStore() {
  const save = () => {
    try {
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
      localStorage.setItem(LOCAL_CATEGORIES_KEY, JSON.stringify(categories));
    } catch {
      // 저장이 막힌 환경(사생활 보호 모드 등)에서는 화면에만 남긴다.
    }
  };
  // 고친 복사본을 화면에 반영하고 저장한다.
  const commit = (nextEvents, nextCategories) => {
    setData(nextEvents, nextCategories);
    save();
  };

  return {
    others: '',
    addEvent(date, event) {
      const next = structuredClone(events);
      next[date] = [...(next[date] || []), { id: newId(), ...event }];
      sortDay(next[date]);
      commit(next, categories);
    },
    deleteEvent(date, id) {
      const next = structuredClone(events);
      next[date] = (next[date] || []).filter((ev) => ev.id !== id);
      if (next[date].length === 0) delete next[date];
      commit(next, categories);
    },
    addCategory(name, color) {
      const cat = { id: newId(), name, color };
      commit(events, [...categories, cat]);
      return cat;
    },
    deleteCategory(id) {
      // 카테고리를 지워도 일정은 남기고 '카테고리 없음'으로 바꾼다.
      const next = structuredClone(events);
      Object.values(next).forEach((list) => list.forEach((ev) => {
        if (ev.categoryId === id) ev.categoryId = '';
      }));
      commit(next, categories.filter((c) => c.id !== id));
    },
  };
}

function startLocal() {
  const local = readLocal();
  store = localStore();
  setData(local.events || {}, local.categories || []);
  setStatus('local');
}

// ---------- Firebase ----------

function showAuth(message, { canSignIn = true, canSwitch = false } = {}) {
  calendarApp.hidden = true;
  authPanel.hidden = false;
  authMessage.textContent = message;
  signInBtn.hidden = !canSignIn;
  switchAccountBtn.hidden = !canSwitch;
  signOutBtn.hidden = true;
  todayBtn.hidden = true;
  setStatus('signedOut');
}

function showCalendar() {
  authPanel.hidden = true;
  calendarApp.hidden = false;
  signOutBtn.hidden = false;
  todayBtn.hidden = false;
}

async function startFirebase() {
  let sdk;
  try {
    const [app, auth, fs] = await Promise.all([
      import(`${FIREBASE_SDK}/firebase-app.js`),
      import(`${FIREBASE_SDK}/firebase-auth.js`),
      import(`${FIREBASE_SDK}/firebase-firestore.js`),
    ]);
    sdk = { app, auth, fs };
  } catch {
    setStatus('offline');
    showAuth('Firebase를 불러오지 못했어요. 인터넷에 연결한 뒤 다시 열어 주세요.', { canSignIn: false });
    return;
  }
  const { auth: A, fs } = sdk;

  const app = sdk.app.initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  // 일정을 기기에 저장해 두어서 인터넷이 끊겨도 보고 고칠 수 있다.
  const db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }),
  });

  signInBtn.onclick = () => signIn(A, auth);
  switchAccountBtn.onclick = () => signOutAndReset(A, auth, fs, db);
  signOutBtn.onclick = () => {
    if (confirm('로그아웃할까요?\n이 기기에 저장해 둔 일정 사본도 지워져요.')) signOutAndReset(A, auth, fs, db);
  };

  let unsubscribe = () => {};
  A.onAuthStateChanged(auth, async (user) => {
    unsubscribe();
    if (!user) {
      showAuth('함께 쓰는 캘린더예요. 허용된 Google 계정으로 로그인해 주세요.');
      return;
    }
    unsubscribe = await enterCalendar(fs, db, user);
  });
}

async function signIn(A, auth) {
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await A.signInWithPopup(auth, provider);
  } catch (err) {
    // 팝업이 막히는 환경(일부 홈 화면 앱)에서는 페이지를 옮겨 가며 로그인한다.
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(err.code)) {
      await A.signInWithRedirect(auth, provider);
    } else if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      alert(`로그인하지 못했어요. (${err.code || err.message})`);
    }
  }
}

async function signOutAndReset(A, auth, fs, db) {
  await A.signOut(auth);
  // 다른 사람이 이 기기를 쓸 수 있으니 저장해 둔 일정 사본도 지운다.
  try {
    await fs.terminate(db);
    await fs.clearIndexedDbPersistence(db);
  } catch {
    // 다른 탭이 열려 있으면 지우지 못할 수 있다. 다음에 로그인한 계정만 볼 수 있으니 괜찮다.
  }
  location.reload();
}

async function enterCalendar(fs, db, user) {
  const email = user.email;
  // 허용 목록에 있는지 확인한다. 오프라인이라 확인할 수 없으면 일단 들어가고, 규칙이 막으면 그때 안내한다.
  try {
    const member = await fs.getDoc(fs.doc(db, 'members', email));
    if (!member.exists()) {
      showNotMember(email);
      return () => {};
    }
  } catch (err) {
    if (err.code === 'permission-denied') {
      showNotMember(email);
      return () => {};
    }
  }

  showCalendar();
  setStatus('connecting');
  const calRef = fs.doc(db, 'calendars', CALENDAR_ID);
  const eventsCol = fs.collection(calRef, 'events');
  const catsCol = fs.collection(calRef, 'categories');
  store = firebaseStore(fs, db, eventsCol, catsCol, email);

  const onError = (err) => {
    if (err.code === 'permission-denied') showNotMember(email);
    else console.error(err);
  };

  let nextCategories = categories;
  const stopCats = fs.onSnapshot(fs.query(catsCol, fs.orderBy('order')), (snap) => {
    nextCategories = snap.docs.map((d) => ({ id: d.id, name: d.data().name, color: d.data().color }));
    setData(events, nextCategories);
  }, onError);

  const stopEvents = fs.onSnapshot(eventsCol, { includeMetadataChanges: true }, (snap) => {
    const byDate = {};
    snap.forEach((d) => {
      const ev = { id: d.id, ...d.data() };
      (byDate[ev.date] ||= []).push(ev);
    });
    Object.values(byDate).forEach(sortDay);
    setData(byDate, nextCategories);

    if (snap.metadata.hasPendingWrites) setStatus(navigator.onLine ? 'saving' : 'offline');
    else if (snap.metadata.fromCache) setStatus(navigator.onLine ? 'connecting' : 'offline');
    else setStatus('synced');
  }, onError);

  importOldData(fs, calRef, eventsCol, catsCol).catch((err) => console.warn('예전 일정 옮기기 실패:', err));
  return () => { stopCats(); stopEvents(); };
}

function showNotMember(email) {
  showAuth(`${email} 계정은 이 캘린더의 허용 목록에 없어요. 캘린더 주인에게 이 이메일을 등록해 달라고 알려 주세요.`,
    { canSignIn: false, canSwitch: true });
}

// Firestore에 바로 쓴다. 기다리지 않아도 화면에는 바로 보이고(오프라인이어도),
// 실제로 올라가는 건 Firebase가 알아서 한다.
function firebaseStore(fs, db, eventsCol, catsCol, email) {
  const fail = (promise) => promise.catch(showError);
  return {
    others: '\n다른 기기에서도 함께 지워져요.',
    addEvent(date, event) {
      fail(fs.setDoc(fs.doc(eventsCol, newId()), { date, ...event, createdBy: email }));
    },
    deleteEvent(date, id) {
      fail(fs.deleteDoc(fs.doc(eventsCol, id)));
    },
    addCategory(name, color) {
      const cat = { id: newId(), name, color };
      fail(fs.setDoc(fs.doc(catsCol, cat.id), { name, color, order: Date.now() }));
      return cat;
    },
    deleteCategory(id) {
      // 카테고리를 지워도 일정은 남기고 '카테고리 없음'으로 바꾼다.
      const batch = fs.writeBatch(db);
      batch.delete(fs.doc(catsCol, id));
      Object.values(events).flat()
        .filter((ev) => ev.categoryId === id)
        .forEach((ev) => batch.update(fs.doc(eventsCol, ev.id), { categoryId: '' }));
      fail(batch.commit());
    },
  };
}

// 예전에 쓰던 일정을 Firebase로 옮긴다.
// 1) 이 기기에만 저장했던 일정(GitHub Pages 등)  2) PC 공유 서버(server.py)의 data.json — 한 번만
async function importOldData(fs, calRef, eventsCol, catsCol) {
  const local = readLocal();
  const hasLocal = Boolean(local.events || local.categories);
  let pc = null;
  try {
    const res = await fetch('api/data');
    if (res.ok) pc = await res.json();
  } catch {
    // PC 서버에서 연 게 아니면 없다.
  }
  if (!hasLocal && !pc) return;

  const calendar = await fs.getDocFromServer(calRef).catch(() => null);
  const pcDone = Boolean(calendar?.exists() && calendar.data().importedPcServer);
  const sources = [];
  if (hasLocal) sources.push({ events: local.events || {}, categories: local.categories || [] });
  if (pc && !pcDone) sources.push(pc);
  if (sources.length === 0) return;

  // 이미 Firebase에 있는 것과 겹치지 않게 서버의 최신 목록과 비교한다.
  const [eventSnap, catSnap] = await Promise.all([fs.getDocsFromServer(eventsCol), fs.getDocsFromServer(catsCol)]);
  const eventIds = new Set(eventSnap.docs.map((d) => d.id));
  const catByName = new Map(catSnap.docs.map((d) => [d.data().name, d.id]));
  const catIds = new Set(catSnap.docs.map((d) => d.id));
  const writes = [];
  const idMap = {};
  let order = Date.now();

  for (const source of sources) {
    for (const c of source.categories || []) {
      const name = String(c.name || '').trim().slice(0, 12);
      if (!name || !/^#[0-9a-fA-F]{6}$/.test(c.color) || !/^[A-Za-z0-9]{1,32}$/.test(c.id)) continue;
      if (catByName.has(name)) { idMap[c.id] = catByName.get(name); continue; }
      if (catIds.has(c.id)) continue;
      writes.push([fs.doc(catsCol, c.id), { name, color: c.color, order: order++ }]);
      catByName.set(name, c.id);
      catIds.add(c.id);
    }
    for (const [date, list] of Object.entries(source.events || {})) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(list)) continue;
      for (const ev of list) {
        const title = String(ev.title || '').trim().slice(0, 60);
        if (!title || !/^[A-Za-z0-9]{1,32}$/.test(ev.id) || eventIds.has(ev.id)) continue;
        const time = (t) => (/^\d{2}:\d{2}$/.test(t) ? t : '');
        const start = time(ev.start);
        const categoryId = idMap[ev.categoryId] || (catIds.has(ev.categoryId) ? ev.categoryId : '');
        writes.push([fs.doc(eventsCol, ev.id), {
          date, title, categoryId, start, end: start ? time(ev.end) : '',
          memo: String(ev.memo || '').slice(0, 500), createdBy: 'imported',
        }]);
        eventIds.add(ev.id);
      }
    }
  }

  // 한 번에 500개까지 쓸 수 있어서 나눠 올린다.
  for (let i = 0; i < writes.length; i += 400) {
    const batch = fs.writeBatch(calRef.firestore);
    writes.slice(i, i + 400).forEach(([ref, data]) => batch.set(ref, data));
    await batch.commit();
  }
  if (pc && !pcDone) await fs.setDoc(calRef, { importedPcServer: true }, { merge: true });
  if (hasLocal) clearLocal();
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

  store.addEvent(dateKey(selected), {
    title,
    categoryId: categorySelect.value,
    start,
    end: start ? end : '',
    memo: memoInput.value.trim(),
  });
  // 같은 카테고리로 이어서 입력하기 쉽게 카테고리는 남겨 둔다.
  const keepCategory = categorySelect.value;
  addForm.reset();
  categorySelect.value = keepCategory;
  titleInput.focus();
}

function deleteEvent(id) {
  store.deleteEvent(dateKey(selected), id);
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
  const created = store.addCategory(name, color);
  catForm.reset();
  renderCategories(); // 다음 카테고리용으로 안 쓴 색을 다시 골라 둔다
  categorySelect.value = created.id; // 방금 만든 카테고리로 바로 일정을 넣을 수 있게
}

function deleteCategory(id) {
  const cat = categories.find((c) => c.id === id);
  if (!confirm(`'${cat.name}' 카테고리를 지울까요?\n이 카테고리의 일정은 지워지지 않고 '카테고리 없음'이 돼요.${store.others}`)) return;
  store.deleteCategory(id);
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
todayBtn.addEventListener('click', () => {
  selectDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
});
endInput.addEventListener('input', () => endInput.setCustomValidity(''));
startInput.addEventListener('input', () => endInput.setCustomValidity(''));
catNameInput.addEventListener('input', () => catNameInput.setCustomValidity(''));
addForm.addEventListener('submit', addEvent);
catForm.addEventListener('submit', addCategory);

renderCategories();
render();
if (firebaseConfig) startFirebase();
else startLocal();

// 홈 화면에 설치할 수 있게 하고, 인터넷이 없어도 앱이 열리게 한다.
// (HTTPS 주소나 localhost에서만 동작한다.)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
