const TIMELINE_DATE_KEY = 'my-dashboard-timeline-date';
let renderedTimelineDate = '';
const getJapanDateKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
const renderDailyTimeline = () => {
  const list = document.querySelector('#timelineList');
  if (!list) return;
  const items = window.createDailyTimeline ? window.createDailyTimeline(new Date()) : [];
  list.replaceChildren(...items.map(item => {
    const row = document.createElement('div');
    row.className = 'timeline-item';
    row.innerHTML = `<time>${item.time}</time><div><strong>${item.title}</strong><small>${item.note}</small></div>`;
    return row;
  }));
  const today = getJapanDateKey();
  renderedTimelineDate = today;
  localStorage.setItem(TIMELINE_DATE_KEY, today);
  const status = document.querySelector('#timelineStatus');
  if (status) status.textContent = `AI秘書案・${today}更新`;
  const intro = document.querySelector('#timelineIntro');
  if (intro) intro.textContent = '勤務時間・休日ルールと進行中タスクから、毎日自動で組み直します。';
};
document.addEventListener('DOMContentLoaded', () => {
  renderDailyTimeline();
  setInterval(() => {
    const today = getJapanDateKey();
    if (today !== renderedTimelineDate) renderDailyTimeline();
  }, 60000);
});
