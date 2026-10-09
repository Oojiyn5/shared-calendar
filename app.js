// 1단계: 화면만 그린다. 일정 저장·추가 기능은 2단계에서 붙인다.

const grid = document.getElementById('calendarGrid');
const monthTitle = document.getElementById('monthTitle');

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

// 예시 표시용: 일정이 있는 날짜에 점 찍기
const sampleDots = { 9: 2, 14: 1, 21: 3 };

function renderCalendar() {
  monthTitle.textContent = `${viewYear}년 ${viewMonth + 1}월`;
  grid.innerHTML = '';

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevDays = new Date(viewYear, viewMonth, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'day';

    let num;
    if (i < firstDay) {
      num = prevDays - firstDay + i + 1;
      cell.classList.add('other');
    } else if (i >= firstDay + daysInMonth) {
      num = i - firstDay - daysInMonth + 1;
      cell.classList.add('other');
    } else {
      num = i - firstDay + 1;
      const isToday = viewYear === today.getFullYear() && viewMonth === today.getMonth() && num === today.getDate();
      if (isToday) cell.classList.add('today', 'selected');
    }

    cell.innerHTML = `<span class="num">${num}</span>`;
    if (!cell.classList.contains('other') && sampleDots[num]) {
      cell.innerHTML += `<span class="dots">${'<i></i>'.repeat(sampleDots[num])}</span>`;
    }
    grid.appendChild(cell);
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
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  renderCalendar();
});
document.getElementById('addForm').addEventListener('submit', (e) => e.preventDefault());

renderCalendar();
