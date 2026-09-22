/* ════════ 七、装配 ════════ */

function repair(card, plan, opt) {
  const out = structuredClone(card);
  out.spec = 'chara_card_v3';
  out.spec_version = '3.0';
  const d = out.data;
  for (const [k, v] of Object.entries(CARD_FIELDS)) if (d[k] === undefined) d[k] = structuredClone(v);
  if (!Array.isArray(d.alternate_greetings))
    d.alternate_greetings = d.alternate_greetings ? [d.alternate_greetings] : [];
  if (!Array.isArray(d.tags)) d.tags = [];
  if (!d.name) d.name = '未命名卡';
  if (!d.character_book) d.character_book = { name: d.name + '世界书', entries: [] };
  if (!d.character_book.name) d.character_book.name = d.name + '世界书';

  const src = d.character_book.entries || [];

  const buckets = Object.fromEntries(SEGMENTS.map(s => [s.id, []]));
  // 按原 order 从大到小入桶 —— 原卡的数组顺序不一定等于注入顺序，照数组顺序装会打乱分区内的排序
  src
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.insertion_order - a.e.insertion_order)
    .forEach(({ e, i }) => {
      const p = plan.get(i) || { seg: 'rule' };
      if (MARKER_RE.test((e.comment || '').trim()) && opt.marker) return; // 旧标记丢掉，统一重发
      if (/清空局部变量/.test(e.comment || '') && opt.clear) return;
      (buckets[p.seg] || buckets.rule).push(e);
    });

  const result = [],
    log = new Map(),
    acts = new Set();
  const note = (e, f, was, now) => {
    if (String(was) === String(now)) return;
    if (!log.has(e)) log.set(e, {});
    log.get(e)[f] = { was, now };
  };
  const oldClear = src.find(e => /清空局部变量/.test(e.comment || ''));
  const wrapped = SEGMENTS.filter(s => s.wrap && buckets[s.id].length);
  const hasClear = opt.clear || buckets.clear.length;
  // 总条目数 = 内容 + 每个非空分区两条标记 + 清空那条；order 就从这个数递减到 1
  const nContent = SEGMENTS.reduce((n, s) => n + buckets[s.id].length, 0);
  let order = nContent + (opt.marker ? wrapped.length * 2 : 0) + (hasClear && !buckets.clear.length ? 1 : 0);

  const mkMarker = (seg, which) => ({
    id: 0,
    keys: [],
    secondary_keys: [],
    comment: `【${seg.label}:${which}】`,
    content: '',
    constant: true,
    selective: true,
    insertion_order: order--,
    enabled: true,
    position: 'after_char',
    extensions: { ...EXT_TPL, position: 1, depth: 4 },
    use_regex: false,
    __new: true,
    __seg: seg.id,
  });

  for (const seg of SEGMENTS) {
    const items = buckets[seg.id];

    if (seg.id === 'clear') {
      if (opt.clear) {
        if (!oldClear) acts.add('补了一条「清空局部变量」置顶条目');
        const e = oldClear || {};
        result.push({
          ...e,
          id: 0,
          keys: [],
          secondary_keys: [],
          comment: '🗑️清空局部变量(别关)',
          content: e.content || CLEAR_CONTENT,
          constant: true,
          selective: true,
          insertion_order: order--,
          enabled: true,
          position: 'before_char',
          extensions: { ...EXT_TPL, ...(e.extensions || {}), position: 0, depth: 4 },
          use_regex: !!e.use_regex,
          __new: !oldClear,
          __seg: 'clear',
        });
      }
      continue;
    }
    if (!items.length) continue;
    if (opt.marker) {
      result.push(mkMarker(seg, '起始'));
      acts.add('补齐了分区标记条目');
    }

    // 时间线多选一：原卡已经只开着一条（或一条没开）就别动，玩到哪开哪条是作者的事
    const tlOn = items.filter(e => isTimeline(e) && e.enabled).length;
    const needPickTl = tlOn > 1;
    let firstTl = true;
    items.forEach((e, i) => {
      e.__seg = seg.id;
      if (opt.order) {
        note(e, 'order', e.insertion_order, order);
        if (e.insertion_order !== order) acts.add('按咩咩母版把序号从大到小重排了一遍');
        e.insertion_order = order;
      }
      order--;

      // 位置：官方卡除「清空」那条外一律 after_char；原本就是 @Depth 的条目保留（它自己的设计）
      e.extensions = { ...EXT_TPL, ...(e.extensions || {}) };
      if (opt.position) {
        const want = e.position === 'at_depth' ? 'at_depth' : 'after_char';
        note(e, 'position', e.position, want);
        if (e.position !== want) acts.add('把条目放回角色定义之后');
        e.position = want;
        e.extensions.position = POS_NUM[want];
        if (want === 'at_depth' && e.extensions.depth !== 0) {
          e.extensions.depth = 0;
          acts.add('把 @Depth 条目的深度改回 0');
        }
      }

      if (!Array.isArray(e.keys)) e.keys = e.keys ? [String(e.keys)] : [];
      if (opt.keys && seg.trigger && !e.keys.length) {
        const got = keysFromComment(e.comment);
        if (got.length) {
          note(e, 'keys', '无', got.join('/'));
          e.keys = got;
          acts.add('给没关键词的条目补了关键词');
        }
      }
      if (opt.constant) {
        const want = seg.trigger ? !e.keys.length : true;
        note(e, 'constant', e.constant ? '常驻' : '触发', want ? '常驻' : '触发');
        if (e.constant !== want) acts.add('重新分了常驻 / 触发');
        e.constant = want;
      }
      if (opt.enable) {
        let want = e.enabled;
        if (needPickTl && seg.id === 'output' && isTimeline(e)) {
          want = firstTl;
          if (firstTl) firstTl = false;
        }
        if (/占位符|待填|复制本条/.test(e.comment || '')) want = false;
        note(e, 'enabled', e.enabled ? '开' : '关', want ? '开' : '关');
        if (e.enabled !== want) acts.add(needPickTl ? '剧情线收成多选一，占位条目关掉' : '占位条目关掉');
        e.enabled = want;
      }
      if (!Array.isArray(e.secondary_keys)) e.secondary_keys = [];
      if (e.selective === undefined) e.selective = true;
      if (e.use_regex === undefined) e.use_regex = false;
      if (!(e.comment || '').trim()) e.comment = `${seg.label}·未命名${i + 1}`;
      result.push(e);
    });
    if (opt.marker) result.push(mkMarker(seg, '结尾'));
  }
  result.forEach((e, i) => (e.id = i + 1));
  d.character_book.entries = result;
  return { card: out, log, acts: [...acts], count: result.length };
}

const DEFAULT_ASSEMBLY_OPT = {
  order: true,
  position: true,
  keys: true,
  constant: true,
  enable: true,
  marker: true,
  clear: true,
};
/** 原 repair 保留用于可核对迁移。此适配层保护旧清空条目、多条清空条目和带正文的标记。 */
function assembleCard(card, overrides = new Map(), options = {}) {
  const opt = { ...DEFAULT_ASSEMBLY_OPT, ...options },
    source = structuredClone(card);
  if (!source.data.character_book)
    source.data.character_book = { name: (source.data.name || '未命名') + '世界书', entries: [] };
  const original = source.data.character_book.entries || [],
    plan = buildPlan(original, overrides),
    ordinary = [],
    clear = [];
  const indexKey = '__miemieAssemblySourceIndex',
    reserved = new Map(),
    renamed = new Set();
  original.forEach((e, index) => {
    reserved.set(index, { has: Object.prototype.hasOwnProperty.call(e, indexKey), value: e[indexKey] });
    e[indexKey] = index;
    const p = plan.get(index);
    if (p.seg === 'clear') {
      clear.push(e);
      return;
    }
    if (opt.marker && MARKER_RE.test((e.comment || '').trim()) && (e.content || '').length) {
      e.comment = '保留原标记正文 · ' + e.comment;
      renamed.add(index);
    }
    ordinary.push(e);
  });
  source.data.character_book.entries = ordinary;
  const adjusted = new Map(ordinary.map((e, i) => [i, { ...plan.get(e[indexKey]), marker: false }]));
  const result = repair(source, adjusted, { ...opt, clear: false });
  const output = result.card.data.character_book.entries;
  for (const e of output)
    if (renamed.has(e[indexKey])) e.comment = card.data.character_book.entries[e[indexKey]].comment;
  const clearEntries = clear
    .sort((a, b) => b.insertion_order - a.insertion_order)
    .map(e => {
      const clone = { ...e, __seg: 'clear', extensions: { ...EXT_TPL, ...(e.extensions || {}) } };
      if (opt.position) {
        clone.position = 'before_char';
        clone.extensions.position = 0;
      }
      if (opt.constant) clone.constant = true;
      if (opt.clear) {
        clone.enabled = true;
        if (!clone.comment) clone.comment = '🗑️清空局部变量(别关)';
      }
      return clone;
    });
  if (opt.clear && !clearEntries.length) {
    clearEntries.push({
      id: 0,
      keys: [],
      secondary_keys: [],
      comment: '🗑️清空局部变量(别关)',
      content: CLEAR_CONTENT,
      constant: true,
      selective: true,
      insertion_order: 0,
      enabled: true,
      position: 'before_char',
      extensions: { ...EXT_TPL, position: 0, depth: 4 },
      use_regex: false,
      __new: true,
      __seg: 'clear',
    });
    result.acts.push('补了一条「清空局部变量」置顶条目');
  }
  const entries = [...clearEntries, ...output];
  entries.forEach((e, i) => {
    e.id = i + 1;
    if (opt.order) e.insertion_order = entries.length - i;
    const index = e[indexKey];
    if (index !== undefined) {
      const before = card.data.character_book.entries[index];
      if (e.content !== before.content) throw new Error('装配保护：条目正文发生变化，已中止');
      // ST 1.18.0: 2/3=作者注释前后、4=@Depth、5/6=示例消息前后、7=Outlet。
      // 这些数字是作者的注入设计，不能被旧 repair 的 after_char / Depth↓0 逻辑覆盖。
      const specialPosition = before.extensions?.position;
      if (Number.isInteger(specialPosition) && specialPosition >= 2 && specialPosition <= 7) {
        e.position = 'after_char';
        e.extensions.position = specialPosition;
        for (const key of ['depth', 'role'])
          if (Object.prototype.hasOwnProperty.call(before.extensions, key))
            e.extensions[key] = structuredClone(before.extensions[key]);
      }
      const r = reserved.get(index);
      if (r.has) e[indexKey] = r.value;
      else delete e[indexKey];
    }
  });
  result.card.data.character_book.entries = entries;
  result.count = entries.length;
  result.acts = [...new Set(result.acts)];
  result.plan = buildPlan(entries, new Map());
  return result;
}
