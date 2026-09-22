/* ════════ 四、分区判定 ════════ */

function genderOf(e) {
  const c = (e.comment || '').trim();
  if (/^女[\s:：·\/]/.test(c)) return { seg: 'female', sure: true };
  if (/^男[\s:：·\/]/.test(c)) return { seg: 'male', sure: true };
  const m = (e.content || '').match(/性别\s*[:：]\s*([男女])/);
  if (m) return { seg: m[1] === '男' ? 'male' : 'female', sure: true };

  const t = (e.content || '').slice(0, 600);
  if (/B\d{2,3}\s*[-–]\s*W\d{2,3}|罩杯/.test(t)) return { seg: 'female', sure: false };
  const she = (t.match(/她/g) || []).length,
    he = (t.match(/他/g) || []).length;
  if (she >= 2 && she > he * 1.5) return { seg: 'female', sure: false };
  if (he >= 2 && he > she * 1.5) return { seg: 'male', sure: false };
  if (/少女|女孩|女性|姬|巫女|姐姐|妹妹|母亲/.test(t)) return { seg: 'female', sure: false };
  if (/少年|男孩|男性|哥哥|弟弟|父亲|先生/.test(t)) return { seg: 'male', sure: false };
  return { seg: 'female', sure: false };
}

function classify(e) {
  const c = (e.comment || '').trim();
  if (MARKER_RE.test(c)) {
    const nm = c.replace(/^【/, '').split(/[:：]/)[0];
    const hit = SEGMENTS.find(s => nm.includes(s.label) || s.label.includes(nm));
    return { seg: hit ? hit.id : 'rule', marker: true };
  }
  const settle = seg => {
    if (seg !== 'chara') return { seg, marker: false };
    const g = genderOf(e);
    return { seg: g.seg, marker: false, guessedGender: !g.sure };
  };
  for (const [seg, re] of CLASSIFY) if (re.test(c)) return settle(seg);
  const body = (e.content || '').slice(0, 400);
  for (const [seg, re] of CLASSIFY_CONTENT) if (re.test(body)) return settle(seg);
  if (e.keys && e.keys.length) {
    const r = settle('chara');
    r.guessed = true;
    return r;
  }
  return { seg: 'rule', marker: false, guessed: true };
}
/** 卡里已经有【X:起始】【X:结尾】时，按 order 降序扫一遍，条目归它所在的那对标记
 *  —— 人家已经分好的区不要重猜。返回 Map<下标, 分区id>，没有标记就返回空 Map。 */
function planFromMarkers(entries) {
  const got = new Map();
  const seq = entries.map((e, i) => ({ e, i })).sort((a, b) => b.e.insertion_order - a.e.insertion_order);
  let cur = null;
  for (const { e, i } of seq) {
    const c = (e.comment || '').trim();
    const m = c.match(/^【(.+?)[:：](起始|结尾)】$/);
    if (m) {
      const nm = m[1];
      const hit =
        SEGMENTS.find(s => nm === s.label) || SEGMENTS.find(s => nm.includes(s.label) || s.label.includes(nm));
      if (m[2] === '起始') cur = hit ? hit.id : null;
      else cur = null;
      continue;
    }
    if (/清空局部变量/.test(c)) {
      got.set(i, 'clear');
      continue;
    }
    if (cur) got.set(i, cur);
  }
  return got;
}

function buildPlan(entries, overrides) {
  const plan = new Map();
  const byMarker = planFromMarkers(entries);
  entries.forEach((e, i) => {
    const c = classify(e);
    const fromMarker = byMarker.get(i);
    plan.set(i, {
      seg: overrides.get(i) || fromMarker || c.seg,
      marker: c.marker,
      guessed: !overrides.has(i) && !fromMarker && c.guessed,
      guessedGender: !overrides.has(i) && !fromMarker && c.guessedGender,
      viaMarker: !!fromMarker,
    });
  });
  return plan;
}
function keysFromComment(comment) {
  let s = (comment || '').trim();
  s = s.replace(/^[^·:：_]{1,6}[·:：_]\s*/, '');
  s = s.replace(/[（(【\[].*$/, '');
  s = s.replace(/[<>《》]/g, '').trim();
  return s ? [s] : [];
}
const isTimeline = e => TIMELINE_RE.test((e.comment || '').trim()) || /<world_timeline>/.test(e.content || '');
