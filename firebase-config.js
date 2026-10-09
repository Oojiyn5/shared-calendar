// Firebase 설정값. Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig를 그대로 붙여 넣는다.
// 이 값은 공개되어도 괜찮다(누가 읽고 쓸 수 있는지는 firestore.rules가 막는다).
// null로 두면 Firebase 없이 이 기기에만 저장한다.

export const firebaseConfig = {
  apiKey: 'AIzaSyAMt3RkOgQtUABE7IV6bV-1h7vorexdTw0',
  authDomain: 'shared-calendar-7a139.firebaseapp.com',
  projectId: 'shared-calendar-7a139',
  storageBucket: 'shared-calendar-7a139.firebasestorage.app',
  messagingSenderId: '893968402900',
  appId: '1:893968402900:web:7f231465c3239f518d6e41',
};

// 함께 쓰는 캘린더 이름. 바꾸면 새 빈 캘린더가 된다.
export const CALENDAR_ID = 'main';
