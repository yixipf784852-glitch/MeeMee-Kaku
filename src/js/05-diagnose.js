/* ════════ 五、体检 ════════ */

function detectHealth(es) {
  if (!es.length) return { needRebuild: false, isMiemie: false };
  const orders = es.map(e => e.insertion_order);
  const bc = es.filter(e => e.position === 'before_char').length;
  return {
    needRebuild: new Set(orders).size === 1 || bc >= es.length * 0.8,
    isMiemie:
      es.some(e => MARKER_RE.test(e.comment || '')) ||
      es.some(e => /清空局部变量/.test(e.comment || '')) ||
      orders.filter(o => o >= 101).length >= es.length * 0.5,
  };
}

/** kind: "hard" = 真坏了，不修玩不了； "style" = 只是不合咩咩母版，别人的卡有自己的一套 */
function diagnose(card, plan) {
  const d = card.data,
    es = (d.character_book && d.character_book.entries) || [],
    out = [];
  const add = (lv, t, p, tech, n, kind) => out.push({ lv, t, p, tech, n, kind: kind || 'hard' });

  if (!card.spec || !/chara_card_v[23]/.test(card.spec))
    add(
      'crit',
      '酒馆可能整张卡都读不进去',
      '这张卡没有标明自己是角色卡格式。',
      `spec = ${card.spec || '（空）'}，应为 chara_card_v2 或 v3`,
    );
  if (!d.name) add('crit', '卡没有名字', '导进去在角色列表里是一张无名卡。', 'data.name 为空字符串');
  if (!d.first_mes) add('crit', '没有开场白', '点进聊天是一片空白，玩家不知道从哪开口。', 'data.first_mes 为空');
  const missing = Object.keys(CARD_FIELDS).filter(k => d[k] === undefined);
  if (missing.length)
    add('warn', '卡的基本字段有缺', '有些酒馆版本会在导入时卡住。', `缺字段：${missing.join('、')}`, missing.length);

  if (!es.length) {
    add('crit', '这张卡没有世界书', '设定、角色、地点全都不在，只剩一段人设。', 'data.character_book.entries 为空');
    return out;
  }

  const orders = es.map(e => e.insertion_order);
  if (es.length > 1 && new Set(orders).size === 1)
    add(
      'crit',
      '所有条目的优先级都一样',
      '酒馆不知道该先读哪条，注入顺序变成随机的。分区结构等于不存在。',
      `${es.length} 条的 insertion_order 全部 = ${orders[0]}；母版要求按 556→1 分八个段位`,
      es.length,
    );
  else {
    const seq = es.map(e => e.insertion_order).sort((a, b) => b - a);
    const tidy = seq[0] === es.length && seq.every((o, i) => o === es.length - i);
    if (!tidy)
      add(
        'info',
        '序号不是咩咩母版的紧凑排法',
        '母版是从总条目数一路递减到 1、一条一个号、中间不空。整理一下，以后加条目、挪分区都好办。',
        `当前 order 跨度 ${seq[seq.length - 1]}~${seq[0]}，共 ${es.length} 条`,
        0,
        'style',
      );
  }

  const bc = es.filter(e => e.position === 'before_char').length;
  if (bc >= es.length * 0.8)
    add(
      'crit',
      '设定全堆在人设前面了',
      'AI 先读完一大堆百科，最后才知道自己要演谁 —— 人设被冲掉，这是卡玩不了最常见的原因。',
      `${bc} / ${es.length} 条 position = before_char（extensions.position = 0）；除清空变量那条外都该是 after_char 或 at_depth`,
      bc,
    );

  const dep = es.filter(e => e.position === 'at_depth' && (e.extensions || {}).depth !== 0);
  if (dep.length)
    add(
      'warn',
      '常驻规则插错了位置',
      '状态栏、思维链这类规则没贴到对话末尾，AI 容易忘。',
      `${dep.length} 条 at_depth 但 extensions.depth ≠ 0（母版要求 @Depth↓0）`,
      dep.length,
    );

  const nokey = es.filter(e => !e.constant && !(e.keys || []).length);
  if (nokey.length)
    add(
      'crit',
      '有些设定永远不会被读到',
      '这些条目既不是常驻、又没设关键词，玩一辈子也触发不了，等于白写。',
      `${nokey.length} 条 constant=false 且 keys 为空`,
      nokey.length,
    );

  const tl = es.filter(isTimeline);
  if (tl.length > 1 && tl.filter(e => e.enabled).length > 1)
    add(
      'crit',
      '好几条剧情线同时开着',
      'AI 会把第一季和最后一季的事混在一起讲，时间点全乱、还会剧透。',
      `${tl.filter(e => e.enabled).length} / ${tl.length} 条时间线条目同时 enabled；母版要求多选一`,
      tl.length,
    );
  else if (es.every(e => e.enabled) && es.length > 10)
    add(
      'info',
      '所有条目都开着',
      '如果里面有该按进度切换、或者留着备用的条目，它们一直在烧 token。没有的话不用管。',
      `${es.length} 条全 enabled`,
      es.length,
      'style',
    );

  const noName = es.filter(e => !(e.comment || '').trim());
  if (noName.length)
    add(
      'warn',
      '有条目没名字',
      '在酒馆世界书列表里认不出是哪条，以后想改找不着。',
      `${noName.length} 条 comment 为空`,
      noName.length,
    );
  const seen = {},
    dup = new Set();
  es.forEach(e => {
    const c = (e.comment || '').trim();
    if (c && seen[c]) dup.add(c);
    if (c) seen[c] = 1;
  });
  if (dup.size)
    add(
      'warn',
      '有条目重名',
      '改一条的时候不知道改的是哪一条。',
      `重复的名字：${[...dup].slice(0, 4).join('、')}`,
      dup.size,
    );

  if (!es.some(e => MARKER_RE.test((e.comment || '').trim())))
    add(
      'info',
      '没有咩咩母版的分区标记',
      '条目多了以后不好维护。这是咩咩的规矩，别人的卡没有很正常。',
      '一条【XX:起始】/【XX:结尾】都没有',
      0,
      'style',
    );
  if (!es.some(e => /清空局部变量/.test(e.comment || '')))
    add(
      'info',
      '缺一条清空变量的条目',
      '卡里如果用了 {{setvar}} 变量，换卡重开时上一局的残留会串进来。没用变量就不用管。',
      '母版要求 order 556、before_char、常驻',
      0,
      'style',
    );

  const gg = [...plan.values()].filter(p => p.guessedGender).length;
  if (gg)
    add(
      'info',
      '有角色的男女是猜出来的',
      `这张卡的角色条目没写「性别:」，${gg} 条是照正文口吻猜的男女分区。翻开第 ④ 步的明细表能逐条改。`,
      `${gg} 条角色靠三围 / 他她词频 / 少年少女等线索判定`,
      gg,
      'style',
    );

  const extBad = es.filter(e => !e.extensions || Object.keys(e.extensions).length < 10);
  if (extBad.length)
    add(
      'warn',
      '条目的高级设置不全',
      '扫描深度、防递归这些全按默认跑，可能出现注入失控。',
      `${extBad.length} 条 extensions 字段少于 10 个（完整应有 31 个）`,
      extBad.length,
    );

  if (!out.length) add('ok', '没查出结构问题', '字段、段位、位置、关键词都对得上，可以直接导入。', '');
  return out;
}
