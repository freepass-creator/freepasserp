/**
 * mobile/page-cache.js — sessionStorage 기반 HTML 캐시 헬퍼
 *
 * 사용:
 *   import { wireHtmlCache } from './page-cache.js';
 *   wireHtmlCache('fp_pl_html', $grid);
 *
 * 동작:
 *   - 호출 즉시 캐시값으로 element.innerHTML 복원 (있으면)
 *   - pagehide 이벤트에서 현재 innerHTML을 캐시에 저장
 *   - 페이지 재방문 시 데이터 fetch 전 즉시 표시되어 깜빡임 제거
 */
export function wireHtmlCache(key, $el) {
  if (!$el) return;
  // 복원
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) $el.innerHTML = cached;
  } catch {}
  // 저장
  window.addEventListener('pagehide', () => {
    try { sessionStorage.setItem(key, $el.innerHTML); } catch {}
  });
}
