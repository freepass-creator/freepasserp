/**
 * color-codes.js — 색상 코드 마스터
 * 출처: freepasserp 공유 시트의 외부색상/내부색상 컬럼 unique 값
 */

export const EXT_COLORS = [
  '화이트',
  '실버',
  '그레이',
  '블랙',
  '네이비',
  '블루계열',
  '그린계열',
  '레드계열',
  '브라운계열',
  '기타',
];

export const INT_COLORS = [
  '블랙',
  '그레이',
  '베이지',
  '브라운',
  '네이비',
  '레드',
  '화이트',
  '기타',
];

export function getExtColors() { return EXT_COLORS; }
export function getIntColors() { return INT_COLORS; }
