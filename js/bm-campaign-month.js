/* ホームのキャンペーン見出し（.bm-campaign-link）を日本時間で切り替える。
   1) 期間限定キャンペーン（#127 Google広告・11月20日まで）: リンクの data-bm-campaign-until（YYYY-MM-DD・日本時間でその日の終わりまで）を
      過ぎたら [data-bm-campaign-limited] を隠し、[data-bm-campaign-monthly]（○月限定 シナリオ制作無料キャンペーン）を出して
      aria-label を data-bm-campaign-after-label に差し替える
   2) 「○月限定」を日本時間の当月に合わせる（#63）
   HTML には公開時点の表示を書いておくので、JS が動かない環境ではその表示が残る。
   キャンペーンを終えるときは index.html の見出し（.bm-campaign-link）ごと外す。 */
(function () {
  'use strict';
  var link = document.querySelector('[data-bm-campaign]');
  if (!link) return;

  // 閲覧者の端末の時刻帯ではなく、日本時間で日付を決める
  var parts = {};
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date())
      .forEach(function (p) { parts[p.type] = Number(p.value); });
  } catch (e) {
    return;
  }
  var year = parts.year, month = parts.month, day = parts.day;
  if (!(year > 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return;
  var today = year * 10000 + month * 100 + day;

  var until = link.getAttribute('data-bm-campaign-until');
  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until) && today > Number(until.replace(/-/g, ''))) {
    var limited = link.querySelector('[data-bm-campaign-limited]');
    var monthly = link.querySelector('[data-bm-campaign-monthly]');
    var afterLabel = link.getAttribute('data-bm-campaign-after-label');
    if (limited && monthly) {
      limited.hidden = true;
      monthly.hidden = false;
      if (afterLabel) link.setAttribute('aria-label', afterLabel);
    }
  }

  var label = link.querySelector('[data-bm-campaign-month]');
  if (!label) return;
  var text = month + '月限定';
  label.textContent = text;
  var aria = link.getAttribute('aria-label');
  if (aria) link.setAttribute('aria-label', aria.replace(/^\d{1,2}月限定/, text));
})();
