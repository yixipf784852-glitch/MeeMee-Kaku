/* ════════ 六、缺件盘点 ════════ */

function isEmptyMarker(e) {
  return MARKER_RE.test((e.comment || '').trim()) && !(e.content || '').trim();
}
function meaningfulEntries(card) {
  return (card.data.character_book?.entries || []).filter(
    e => !isEmptyMarker(e) && !/清空局部变量/.test(e.comment || '') && (e.content || '').trim(),
  );
}
function detectEntryTemplate(e) {
  if (e.__tplId) return e.__tplId;
  const t = e.content || '',
    c = e.comment || '';
  if (/<world_timeline>|^时间线|^剧情[:：·]/.test(t + '\n' + c) || isTimeline(e)) return 'timeline';
  // 只认条目自己的结构和名字：战斗思维链末尾写了句「写入状态栏」，曾被拿状态栏模板去套
  if (/\{\{setvar::status_format::|<status_format>/.test(t) || /^(?:【?输出(?:规则)?[】:：·]\s*)?状态栏/.test(c.trim()))
    return 'status';
  if (/\{\{setvar::combat_driver::|<combat_driver>/.test(t)) return 'cot';
  if (/<easter_eggs>/.test(t) || /话题池/.test(c)) return 'topics';
  if (/<核心规则[:：]/.test(t) || /世界规则/.test(c)) return 'worldrule';
  if (/<地点[:：]/.test(t)) return 'place';
  if (/<设定_|<核心设定[:：]/.test(t)) return 'setting';
  if (/<[^<>\s/]+character>/.test(t)) return /^\s*性格特征\s*:/m.test(t) ? 'charV2' : 'charV1';
  const p = e.__seg || classify(e).seg;
  if (['female', 'male', 'other'].includes(p)) return 'chara';
  if (p === 'setting' || p === 'place') return p;
  return null;
}
function rosterNames(roster) {
  const lines = typeof roster === 'string' ? roster.split(/\r?\n/) : Array.isArray(roster) ? roster : [];
  return [
    ...new Set(
      lines.map(x => (typeof x === 'string' ? x.split('|')[0].trim() : String(x?.name || '').trim())).filter(Boolean),
    ),
  ];
}
function hasCharacterNamed(entries, name) {
  return entries.some(e => {
    const names = [...(e.keys || []), ...(e.content || '').matchAll(/^\s*名字\s*[:：]\s*([^\n]+)/gm)].map(x =>
      Array.isArray(x) ? x[1].trim() : String(x).trim(),
    );
    const tag = (e.content || '').match(/<([^<>\s/]+)character>/);
    if (tag) names.push(tag[1]);
    const comment = (e.comment || '').replace(/^(?:【?角色卡?】?|[男女]性角色|其他角色)\s*[:：·_]?\s*/, '').trim();
    names.push(comment);
    return names.some(x => x === name || x.split(/[/／、（(]/)[0].trim() === name);
  });
}
function checkParts(card, roster = []) {
  const d = card.data,
    real = meaningfulEntries(card),
    names = rosterNames(roster);
  const count = id =>
    real.filter(e => {
      const t = detectEntryTemplate(e);
      return id === 'chara'
        ? ['chara', 'charV1', 'charV2'].includes(t)
        : id === 'timeline'
          ? /^tl|timeline/.test(t || '')
          : t === id;
    }).length;
  const chars = real.filter(e => ['chara', 'charV1', 'charV2'].includes(detectEntryTemplate(e))),
    missingNames = names.filter(name => !hasCharacterNamed(chars, name));
  const opening = [d.first_mes, ...(d.alternate_greetings || [])].filter(x => typeof x === 'string' && x.trim()).length;
  const defs = [
    ['chara', '角色条目', '主要角色各一条'],
    ['setting', '核心设定', '至少一条独立核心设定'],
    ['place', '地点条目', '至少一条可引用的地点'],
    ['worldrule', '世界规则', '叙述规范、时代锚定与词汇替换'],
    ['timeline', '时间线', '至少一条时间线，多条按进度选择'],
    ['status', '状态栏', '按世界机制定义字段与更新规则'],
    ['topics', '开放性话题池', '带来源的触发、呈现和延伸'],
    ['opening', '开场白', '至少一条主开场或备选开场'],
    ['cot', '战斗思维链', '有战斗或对抗的作品才需要', true],
  ];
  return defs.map(([id, name, want, optional]) => {
    const n = id === 'opening' ? opening : count(id),
      ok = id === 'chara' && names.length ? missingNames.length === 0 : n >= 1;
    return {
      id,
      name,
      ok,
      got:
        id === 'chara' && names.length
          ? `${names.length - missingNames.length}/${names.length} 位清单角色`
          : n
            ? `${n} 条`
            : '没有',
      want,
      gen: true,
      optional: !!optional,
      ...(id === 'chara' ? { missingNames, count: n } : { count: n }),
    };
  });
}
