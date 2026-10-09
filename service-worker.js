// 서비스 워커: 앱에 필요한 모든 파일을 미리 저장해 두어서 인터넷이 없어도 앱이 열리게 한다.
// 화면 파일을 바꾸면 CACHE 이름의 숫자를 올려서 예전 저장본을 지운다.
// 경로는 모두 상대 경로라서 GitHub Pages처럼 하위 폴더에 올려도 그대로 동작한다.

const CACHE = 'calendar-v3';

// 앱 파일. 하나라도 받지 못하면 설치를 다시 시도한다.
const APP_FILES = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'firebase-config.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

// Firebase 라이브러리. 주소에 버전이 들어 있어 내용이 바뀌지 않으므로 한 번 받으면 계속 쓴다.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const SDK_FILES = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map((f) => FIREBASE_SDK + f);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(async (cache) => {
    await cache.addAll(APP_FILES);
    // 라이브러리는 받지 못해도 설치는 계속한다. (처음 쓸 때 다시 받아 저장한다.)
    await Promise.all(SDK_FILES.map((url) => cache.add(url).catch(() => {})));
  }));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function saveCopy(request, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Firebase 라이브러리: 저장해 둔 것을 먼저 쓴다.
  if (request.url.startsWith(FIREBASE_SDK)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => saveCopy(request, res))));
    return;
  }

  // 일정 데이터(api/, Firebase 서버)는 건드리지 않는다. Firebase는 자기 방식으로 기기에 저장한다.
  if (url.origin !== location.origin || url.pathname.includes('/api/')) return;

  // 앱 파일: 먼저 새 파일을 받아 보고(고친 내용이 바로 보이게), 안 되면(오프라인) 저장해 둔 파일을 쓴다.
  event.respondWith(
    fetch(request)
      .then((res) => saveCopy(request, res))
      .catch(() => caches.match(request, { ignoreSearch: true })
        .then((hit) => hit || (request.mode === 'navigate' ? caches.match('index.html') : undefined))
        .then((hit) => hit || Response.error())),
  );
});
