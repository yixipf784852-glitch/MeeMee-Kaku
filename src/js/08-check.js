/* ════════ 八、格式自检 CHECK ════════ */

function pairedTagIssues(text, pattern, label) {
  const matches = [...text.matchAll(pattern)],
    stack = [],
    errors = [];
  let opens = 0;
  for (const m of matches) {
    const closing = !!m[1],
      name = m[2];
    if (!closing) {
      opens++;
      stack.push(name);
    } else if (stack.pop() !== name) errors.push(label + '标签不匹配：' + m[0]);
  }
  if (!opens) errors.push('没有 ' + label + ' 标签');
  if (stack.length) errors.push(label + '标签未闭合：' + stack.join('、'));
  return errors;
}
function dateAndEventIssues(text) {
  const lines = text.match(/^\s*-\s*事件[^\n]*/gm) || [],
    errors = [],
    seen = new Set();
  let lastDate = null,
    lastId = null;
  const rank = id => {
    const m = id.match(/^([A-Z]+)(\d*)$/);
    let n = 0;
    for (const c of m[1]) n = n * 26 + c.charCodeAt(0) - 64;
    return [n, Number(m[2] || 0)];
  };
  if (!lines.length) return ['未解析到「-事件A: 标题 (Y年M月D日)」事件行'];
  for (const line of lines) {
    const m = line.match(/^\s*-\s*事件\s*([A-Z]+\d*)\s*:.*?[（(](\d{1,6})年(\d{1,2})月(\d{1,2})日/);
    if (!m) {
      errors.push('事件行缺编号、半角冒号或日期：' + line.slice(0, 65));
      continue;
    }
    const id = m[1],
      year = Number(m[2]),
      month = Number(m[3]),
      day = Number(m[4]),
      date = year * 10000 + month * 100 + day;
    const days = [
      31,
      year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
      31,
      30,
      31,
      30,
      31,
      31,
      30,
      31,
      30,
      31,
    ];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]) errors.push('事件' + id + '的日期无效');
    if (lastDate !== null && date < lastDate) errors.push('事件' + id + '日期回退，时间线必须单向前进');
    lastDate = date;
    if (seen.has(id)) errors.push('事件编号重复：' + id);
    seen.add(id);
    const current = rank(id);
    if (lastId && (current[0] < lastId[0] || (current[0] === lastId[0] && current[1] < lastId[1])))
      errors.push('事件编号没有顺序递增：' + id);
    lastId = current;
  }
  if (!/^\s*-\s*事件\s*A(?:\d*)\s*:/m.test(text)) errors.push('事件编号应从 A / A1 开始');
  const sandbox = text.lastIndexOf('沙盒模式'),
    lastEvent = text.lastIndexOf(lines[lines.length - 1]);
  if (sandbox < lastEvent) errors.push('最后一个事件后没有沙盒模式收尾');
  return errors;
}
function replacementCount(text) {
  const lines = text.split(/\r?\n/);
  let n = 0,
    inTable = false;
  for (const line of lines) {
    if (/词汇.*(?:替换|对照)|替换.*(?:表|词汇)/.test(line)) {
      inTable = true;
      continue;
    }
    if (/(?:→|⇒|=>|->|替换为|改称为|应称为)/.test(line) && !/^\s*(?:规则|说明|例如)/.test(line)) {
      n++;
      continue;
    }
    if (
      inTable &&
      /^\s*\|/.test(line) &&
      line.split('|').filter(x => x.trim()).length >= 2 &&
      !/^[\s|:\-]+$/.test(line) &&
      !/(?:禁用|禁止|原词|错误|替换|允许|正确|推荐|词汇|不合世界观)/.test(line)
    )
      n++;
    else if (inTable && /^\s*(?:[-*]|\d+[.、)])\s*.+[:：].+/.test(line)) n++;
  }
  return n;
}
function topicIssues(text) {
  const starts = [...text.matchAll(/[\[【]来源\s*[:：]\s*(原著|衍生|自创)[\]】]/g)],
    issues = [];
  if (!starts.length) return ['话题缺 [来源:原著/衍生/自创] 标注'];
  starts.forEach((m, i) => {
    const block = text.slice(m.index, starts[i + 1]?.index ?? text.length);
    for (const part of ['触发', '呈现', '延伸'])
      if (!new RegExp(part + '\\s*[:：]').test(block)) issues.push('第 ' + (i + 1) + ' 个话题缺「' + part + '」');
  });
  return issues;
}
const CHARACTER_ATTRIBUTES = [
  '名字',
  '性别',
  '印象',
  '发色',
  '发型',
  '瞳色',
  '身材',
  '胸部',
  '上衣',
  '下装',
  '配饰',
  '鞋子',
  '心理模型',
  '对话范例',
];
const CHECK = {
  chara: {
    label: '角色',
    segs: ['female', 'male', 'other'],
    rules: [
      { fn: t => pairedTagIssues(t, /<(\/?)\s*([^<>/]+?\s*character)\s*>/g, '角色 character'), lv: 'crit' },
      ...CHARACTER_ATTRIBUTES.map(k => ({
        re: new RegExp('^\\s*' + k + '\\s*:', 'm'),
        msg: '缺属性「' + k + '」或未使用半角冒号',
        lv: 'crit',
      })),
      ...['Trauma', 'Defense', 'Trigger', 'Need'].map(k => ({
        re: new RegExp('^\\s*-\\s*' + k + '\\s*:', 'm'),
        msg: '心理模型缺 ' + k + ' 槽',
        lv: 'crit',
      })),
      {
        bad: new RegExp(
          '^\\s*(?:' + [...CHARACTER_ATTRIBUTES, '性格特征', '行为与表达特征'].join('|') + ')\\s*：',
          'm',
        ),
        msg: '角色属性使用了全角冒号（模板要求半角）',
        lv: 'warn',
      },
    ],
  },
  timeline: {
    label: '时间线',
    segs: [],
    rules: [
      { fn: t => pairedTagIssues(t, /<(\/?)\s*(world_timeline)\s*>/g, 'world_timeline'), lv: 'crit' },
      { fn: dateAndEventIssues, lv: 'crit' },
      { re: /沙盒模式/, msg: '没有沙盒模式收尾', lv: 'crit' },
    ],
  },
  setting: {
    label: '核心设定',
    segs: ['setting'],
    rules: [
      { fn: t => pairedTagIssues(t, /<(\/?)((?:设定_|核心设定[:：])[^<>/]+)>/g, '设定'), lv: 'crit' },
      { re: /^\s*##\s+\S/m, msg: '没有 ## 分类标题', lv: 'crit' },
      {
        fn: t =>
          [...t.matchAll(/<((?:设定_|核心设定[:：])[^<>/]+)>([\s\S]*?)<\/\1>/g)]
            .filter(m => !/^\s*##\s+\S/m.test(m[2]))
            .map(m => '「' + m[1] + '」缺少 ## 分类标题'),
        lv: 'crit',
      },
    ],
  },
  place: {
    label: '地点',
    segs: ['place'],
    rules: [
      { fn: t => pairedTagIssues(t, /<(\/?)(地点[:：][^<>/]+)>/g, '地点'), lv: 'crit' },
      { re: /^\s*##\s+\S/m, msg: '没有 ## 地点标题', lv: 'crit' },
      {
        fn: t =>
          [...t.matchAll(/<(地点[:：][^<>/]+)>([\s\S]*?)<\/\1>/g)]
            .filter(m => !/^\s*##\s+\S/m.test(m[2]))
            .map(m => '「' + m[1] + '」缺少 ## 地点标题'),
        lv: 'crit',
      },
    ],
  },
  opening: {
    label: '开场白',
    segs: [],
    rules: [{ fn: t => pairedTagIssues(t, /<(\/?)\s*(opening)\s*>/g, 'opening'), lv: 'crit' }],
  },
  status: {
    label: '状态栏',
    segs: [],
    rules: [
      { re: /\{\{setvar::status_format::[\s\S]*\}\}/, msg: '缺少 {{setvar::status_format::…}} 外壳', lv: 'crit' },
      {
        fn: t => [
          ...pairedTagIssues(t, /<(\/?)\s*(status_format)\s*>/g, 'status_format'),
          ...pairedTagIssues(t, /<(\/?)\s*(status)\s*>/g, 'status'),
        ],
        lv: 'crit',
      },
      { re: /<!--\s*规则\s*[:：][\s\S]+?-->/, msg: '状态字段缺少 <!-- 规则:… --> 注释', lv: 'crit' },
      {
        fn: t => {
          const body = t
            .replace(/<!--[\s\S]*?-->/g, '')
            .split(/\r?\n/)
            .filter(l => !/(?:严禁|禁止|不要|不使用|不设|不得).*(?:等级|EXP|经验值)/i.test(l))
            .join('\n');
          return /(?:等级|经验值|\bEXP\b|\bLV\.?|\bLevel)\s*[:：=]|<(?:等级|EXP|level)>/i.test(body)
            ? ['状态栏含等级或 EXP 字段']
            : [];
        },
        lv: 'crit',
      },
    ],
  },
  worldrule: {
    label: '世界规则',
    segs: [],
    rules: [
      { fn: t => pairedTagIssues(t, /<(\/?)(核心规则[:：][^<>/]+)>/g, '核心规则'), lv: 'crit' },
      {
        fn: t => (replacementCount(t) >= 8 ? [] : ['词汇替换表不足 8 条（识别到 ' + replacementCount(t) + ' 条）']),
        lv: 'crit',
      },
    ],
  },
  topics: {
    label: '话题池',
    segs: [],
    rules: [
      { fn: t => pairedTagIssues(t, /<(\/?)\s*(easter_eggs)\s*>/g, 'easter_eggs'), lv: 'crit' },
      { fn: topicIssues, lv: 'crit' },
    ],
  },
};
function checkText(tplId, text) {
  const t = String(text ?? ''),
    id = /^charV[12]$/.test(tplId) ? 'chara' : /^tl(?:TV|TVD|Arc|Novel)$/.test(tplId) ? 'timeline' : tplId;
  const def = CHECK[id],
    issues = [];
  if (!def) return { ok: false, issues: [{ lv: 'crit', msg: '未知模板：' + tplId }], warnings: ['未知模板：' + tplId] };
  if (!t.trim()) issues.push({ lv: 'crit', msg: '内容为空' });
  for (const rule of def.rules) {
    if (rule.re) {
      rule.re.lastIndex = 0;
      if (!rule.re.test(t)) issues.push({ lv: rule.lv || 'crit', msg: rule.msg });
    }
    if (rule.bad) {
      rule.bad.lastIndex = 0;
      if (rule.bad.test(t)) issues.push({ lv: rule.lv || 'warn', msg: rule.msg });
    }
    if (rule.fn) {
      const result = rule.fn(t);
      for (const msg of Array.isArray(result)
        ? result
        : result === false
          ? [rule.msg || '格式不符合要求']
          : typeof result === 'string'
            ? [result]
            : [])
        issues.push({ lv: rule.lv || 'crit', msg });
    }
  }
  if (tplId === 'charV2')
    for (const k of ['性格特征', '行为与表达特征'])
      if (!new RegExp('^\\s*' + k + '\\s*:', 'm').test(t))
        issues.push({ lv: 'crit', msg: 'ver2.0 缺属性「' + k + '」' });
  const unique = issues.filter((x, i, a) => a.findIndex(y => y.lv === x.lv && y.msg === x.msg) === i);
  return { ok: !unique.some(x => x.lv === 'crit'), issues: unique, warnings: unique.map(x => x.msg) };
}
/** 只返回需审查条目；空数组表示已识别模板均通过。未识别的自定义规则不误报。 */
function checkCard(card) {
  const out = [];
  (card.data.character_book?.entries || []).forEach((e, index) => {
    if (isEmptyMarker(e) || /清空局部变量/.test(e.comment || '')) return;
    const tplId = detectEntryTemplate(e);
    if (!tplId) return;
    const r = checkText(tplId, e.content);
    if (r.issues.length) out.push({ index, comment: e.comment || '未命名条目', tplId, ...r });
  });
  [card.data.first_mes, ...(card.data.alternate_greetings || [])].forEach((text, i) => {
    if (!text?.trim()) return;
    const r = checkText('opening', text);
    if (r.issues.length) out.push({ index: -1 - i, comment: i ? '备选开场 ' + i : '主开场白', tplId: 'opening', ...r });
  });
  return out;
}

/* 报错分两档。会让 AI 读时间线、状态栏时犯迷糊，或者让状态栏变量失灵的，放「要看一眼」；
   其余只是排版不合咩咩模板（缺 ## 标题、缺模板标签、栏位名不同），导入和游玩都不受影响。 */
const PLAY_ISSUE_RE = /标签不匹配|标签未闭合|日期无效|日期回退|编号重复|setvar::status_format/;
function issueTier(msg) {
  return PLAY_ISSUE_RE.test(String(msg || '')) ? 'play' : 'style';
}
function tieredChecks(card) {
  const all = checkCard(card),
    pick = tier =>
      all.map(c => ({ ...c, list: c.issues.filter(i => issueTier(i.msg) === tier) })).filter(c => c.list.length);
  return { all, play: pick('play'), style: pick('style') };
}
