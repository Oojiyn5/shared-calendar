// Firebase 설정값. Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹)의 firebaseConfig를 그대로 붙여 넣는다.
// 이 값은 공개되어도 괜찮다(누가 읽고 쓸 수 있는지는 firestore.rules가 막는다).
// null로 두면 Firebase 없이 이 기기에만 저장한다.

export const firebaseConfig = null;

// 함께 쓰는 캘린더 이름. 바꾸면 새 빈 캘린더가 된다.
export const CALENDAR_ID = 'main';
