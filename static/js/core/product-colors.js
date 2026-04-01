export const COLOR_MAP = {
  /* 흰색 계열 */
  '흰색':{ h:'#f0f0f0', d:true }, '화이트':{ h:'#f0f0f0', d:true }, '순백색':{ h:'#f8f8f8', d:true },
  '크리스탈화이트':{ h:'#f2f2f0', d:true }, '오로라화이트':{ h:'#f5f3ee', d:true }, '펄화이트':{ h:'#f0ede6', d:true },
  /* 검은색 계열 */
  '검은색':{ h:'#1c1c1c', d:false }, '블랙':{ h:'#1c1c1c', d:false }, '검정':{ h:'#1c1c1c', d:false }, '어반그레이블랙':{ h:'#2a2a2a', d:false },
  /* 은색/실버 계열 */
  '은색':{ h:'#b0b0b0', d:true }, '실버':{ h:'#b0b0b0', d:true }, '문라이트':{ h:'#9baab8', d:false }, '샤이닝실버':{ h:'#c8c8c8', d:true },
  /* 회색 계열 */
  '회색':{ h:'#7a7a7a', d:false }, '그레이':{ h:'#7a7a7a', d:false }, '다크그레이':{ h:'#404040', d:false },
  '스틸그레이':{ h:'#6a7480', d:false }, '팬텀블랙':{ h:'#2d2d2d', d:false }, '그라파이트':{ h:'#4a4a4a', d:false },
  /* 파란색 계열 */
  '파란색':{ h:'#1565c0', d:false }, '블루':{ h:'#1565c0', d:false }, '네이비':{ h:'#1a237e', d:false }, '남색':{ h:'#1a237e', d:false },
  '하늘색':{ h:'#5bacd8', d:false }, '스카이블루':{ h:'#5bacd8', d:false }, '세룰리안블루':{ h:'#3a7eca', d:false },
  '미드나잇블루':{ h:'#1c2d50', d:false },
  /* 빨간색 계열 */
  '빨간색':{ h:'#c0392b', d:false }, '레드':{ h:'#c0392b', d:false }, '빨강':{ h:'#c0392b', d:false },
  '와인':{ h:'#7d1f2a', d:false }, '버건디':{ h:'#800020', d:false }, '첼리레드':{ h:'#cc2222', d:false },
  /* 갈색/브라운 */
  '갈색':{ h:'#7a5c3c', d:false }, '브라운':{ h:'#7a5c3c', d:false }, '카키':{ h:'#7a6a3c', d:false }, '샴페인':{ h:'#c8ac7a', d:true },
  /* 베이지/아이보리 */
  '베이지':{ h:'#cdc09a', d:true }, '아이보리':{ h:'#f5edda', d:true }, '크림':{ h:'#f0e6c8', d:true },
  /* 금색/골드 */
  '금색':{ h:'#c8a832', d:true }, '골드':{ h:'#c8a832', d:true }, '샴페인골드':{ h:'#d4b870', d:true },
  /* 진주/펄 */
  '진주색':{ h:'#ddd8cc', d:true }, '펄':{ h:'#ddd8cc', d:true }, '크리스탈':{ h:'#e0dbd4', d:true },
  /* 초록색 */
  '녹색':{ h:'#2d7034', d:false }, '그린':{ h:'#2d7034', d:false }, '올리브':{ h:'#6b7530', d:false },
  /* 주황/노랑 */
  '주황색':{ h:'#e05c10', d:false }, '오렌지':{ h:'#e05c10', d:false }, '노란색':{ h:'#e0b800', d:true }, '옐로우':{ h:'#e0b800', d:true },
  /* 보라색 */
  '보라색':{ h:'#6a1b9a', d:false }, '퍼플':{ h:'#6a1b9a', d:false },
};

export function colorInfo(name) {
  const n = String(name || '').trim();
  if (!n || n === '-') return null;
  const lower = n.toLowerCase();
  for (const [k, v] of Object.entries(COLOR_MAP)) {
    if (k.toLowerCase() === lower) return v;
  }
  for (const [k, v] of Object.entries(COLOR_MAP)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return null;
}

export function renderColorBadge(label, colorName) {
  const n = String(colorName || '').trim();
  if (!n || n === '-') return `<span class="color-badge color-badge--empty" title="색상미등록">${label}</span>`;
  const info = colorInfo(n);
  if (!info) return `<span class="color-badge color-badge--empty" style="border-style:dashed" title="${n}">${label}</span>`;
  return `<span class="color-badge ${info.d ? 'color-badge--on-light' : 'color-badge--on-dark'}" style="background:${info.h}" title="${n}">${label}</span>`;
}
