// 서비스 워커: 화면 파일을 저장해 두었다가 인터넷이 없어도 앱이 열리게 한다.
// 화면 파일을 바꾸면 CACHE 이름의 숫자를 올려서 예전 저장본을 지운다.

const CACHE = 'calendar-v2';
// Firebase 라이브러리. 주소에 버전이 들어 있어 내용이 바뀌지 않으므로 한 번 받으면 계속 쓴다.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/';
const APP_FILES = [
  './',
  'index.html',
  'app.js',
  'style.css',
  'manifest.webmanifest',
  'firebase-config.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && event.request.url.startsWith(FIREBASE_SDK)) {
    event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
      }
      return res;
    })));
    return;
  }
  // 일정 데이터(api/, Firebase)는 저장해 두지 않는다. Firebase는 자기 방식으로 기기에 저장한다.
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;

  // 먼저 서버에서 새 파일을 받아 보고, 안 되면(오프라인) 저장해 둔 파일을 쓴다.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true })
        .then((hit) => hit || (event.request.mode === 'navigate' ? caches.match('index.html') : undefined))
        .then((hit) => hit || Response.error())),
  );
});
