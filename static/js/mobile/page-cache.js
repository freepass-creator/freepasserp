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
  // 복원 — empty 메시지 캐시는 스킵 (깜빡임 방지)
  try {
    const cached = sessionStorage.getItem(key);
    if (cached && !cached.includes('m-list-empty')) $el.innerHTML = cached;
  } catch {}
  // 저장 — empty 상태는 저장 안 함
  window.addEventListener('pagehide', () => {
    try {
      const html = $el.innerHTML;
      if (html && !html.includes('m-list-empty') && !html.includes('m-skeleton')) {
        sessionStorage.setItem(key, html);
      }
    } catch {}
  });
}
