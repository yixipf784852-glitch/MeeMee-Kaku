/* ════════ 十、生成件定义 ════════ */
const COMMON_RULES = `你在给 SillyTavern 沙盒跑团卡补件，遵守咩咩制卡的规矩：
- 一切内容必须从这部作品自身的世界观与机制推导，禁止照搬任何示例的字段。
- 禁止预设结局、禁止剧透终局与角色生死；禁止"极度/极其/绝对/最"这类极端修饰词。
- 涉及玩家的地方一律写 {{user}}，不要替玩家决定想法与行动。{{user}} 指玩家本人，不是原著里的任何角色：不要把原著主角或其他人物换成 {{user}}。
- 直接输出成品，不要解释、不要前言后语、不要用 markdown 代码围栏包起来。`;
// 时间线记的是原著剧情。模型见到满篇「玩家」「跑团」，容易把小说主角当成玩家写成 {{user}}，这里写死。
const TIMELINE_NAME_RULE = '【人名】时间线记的是原著剧情：原著人物（包括主角）在事件里一律写原名，不要换成 {{user}}。';
const TPL_TEXT = Object.fromEntries(
  Array.from(document.querySelectorAll('script[type="text/plain"][data-tpl]'), element => [
    element.dataset.tpl,
    element.textContent,
  ]),
);
const TEMPLATES = [
  {
    id: 'charV1',
    name: '角色资料 ver1.0',
    cat: '角色卡',
    kind: 'chara',
    seg: 'other',
    wave: 1,
    desc: '外貌穿着、心理模型四槽与三句对话范例',
    expectedChars: 3400,
  },
  {
    id: 'charV2',
    name: '角色资料 ver2.0',
    cat: '角色卡',
    kind: 'chara',
    seg: 'other',
    wave: 1,
    desc: '增加性格特征、行为与表达特征',
    expectedChars: 4000,
  },
  {
    id: 'tlTV',
    name: '时间线 · TV版',
    cat: '时间线',
    kind: 'timeline',
    seg: 'output',
    wave: 2,
    desc: '一集一个独立事件，结尾接沙盒模式',
    expectedChars: 6000,
  },
  {
    id: 'tlTVD',
    name: '时间线 · TV按天',
    cat: '时间线',
    kind: 'timeline',
    seg: 'output',
    wave: 2,
    desc: '跨多天的单集按天细分',
    expectedChars: 6500,
  },
  {
    id: 'tlArc',
    name: '时间线 · 篇章按天',
    cat: '时间线',
    kind: 'timeline',
    seg: 'output',
    wave: 2,
    desc: '篇章内按天切分事件',
    expectedChars: 6500,
  },
  {
    id: 'tlNovel',
    name: '时间线 · 轻小说',
    cat: '时间线',
    kind: 'timeline',
    seg: 'output',
    wave: 2,
    desc: '按卷章节切分，时间保持线性向前',
    expectedChars: 6500,
  },
  {
    id: 'setting',
    name: '核心设定',
    cat: '世界设定',
    kind: 'setting',
    seg: 'setting',
    wave: 1,
    desc: '将核心体系拆成独立设定条目',
    expectedChars: 5000,
  },
  {
    id: 'place',
    name: '地点',
    cat: '世界设定',
    kind: 'place',
    seg: 'place',
    wave: 1,
    desc: '客观描写空间，按地点标签拆条',
    expectedChars: 4000,
  },
  {
    id: 'opening',
    name: '开场白',
    cat: '玩法组件',
    kind: 'opening',
    seg: 'output',
    wave: 3,
    desc: '主开场与备选开场，引用现有地点和时间线',
    expectedChars: 3400,
  },
  {
    id: 'status',
    name: '状态栏',
    cat: '玩法组件',
    kind: 'status',
    seg: 'output',
    wave: 2,
    desc: '从核心机制推导字段，不设等级与 EXP',
    expectedChars: 2600,
  },
  {
    id: 'worldrule',
    name: '世界规则',
    cat: '玩法组件',
    kind: 'worldrule',
    seg: 'rule',
    wave: 1,
    desc: '时代、语言规范与词汇替换表',
    expectedChars: 2600,
  },
  {
    id: 'topics',
    name: '开放性话题池',
    cat: '玩法组件',
    kind: 'topics',
    seg: 'rule',
    wave: 3,
    desc: '原著、衍生、自创三种来源的话题',
    expectedChars: 3000,
  },
];

function loreBlock(l = S.lore || {}) {
  const t = String(l.text || '')
    .trim()
    .slice(0, 12000);
  let s = '';
  if (t) s += `\n【作者提供的原作资料——以这份为准，优先于你自己的记忆】\n${t}\n`;
  if (l.web)
    s += `\n【允许联网】如果你有联网检索能力，请先查证这个作品的设定再动笔（优先萌娘百科、维基百科）；没有联网能力就跳过这条。\n`;
  if (!t)
    s +=
      `\n【没有外部资料】作者没有提供资料${l.web ? '，联网也未必可用' : ''}。你只能依据条目现有正文改写：` +
      `已有的信息照搬保留，资料里没提到的栏位按这个作品的常识克制补全，**拿不准的宁可写得笼统，也不要编造具体的数字、日期、人名和事件**。\n`;
  if (String(l.text || '').trim().length > 12000)
    s += '\n【资料长度说明】本次只提供原作资料的前 12000 字符；未提供的部分不能作为已查证资料。\n';
  return s;
}

function cardContext(card = S.card) {
  if (!card || !card.data) return '【当前卡】尚未新建卡，没有已存在世界书条目。';
  const d = card.data;
  const entries = ((d.character_book && d.character_book.entries) || []).filter(
    e => !MARKER_RE.test(e.comment || '') && !/^🗑️?清空局部变量/.test(e.comment || ''),
  );
  const summaries = entries.map(
    e =>
      `- ${e.comment || e.name || '未命名条目'}${e.enabled === false ? ' [已停用]' : ''}\n${String(e.content || '').slice(0, 200)}`,
  );
  return (
    `【卡名】${d.name || '未命名'}\n【标签】${(d.tags || []).join('、') || '无'}\n【卡的简介】${String(d.description || '').slice(0, 400) || '（空）'}\n` +
    `【现有正文条目，共 ${entries.length} 条；每条摘要最多 200 字符，保留所有条目名，全文未发送】\n${summaries.join('\n') || '（空）'}`
  );
}

function buildJobPrompt(job, ctx = { lore: S.lore, card: S.card, roster: S.roster }) {
  const tpl = TEMPLATES.find(t => t.id === job.tplId);
  if (!tpl) throw new Error('没有找到模板：' + job.tplId);
  const params = job.params || {};
  const work = String(
    (ctx.lore || {}).work || params.work || (ctx.card && ctx.card.data && ctx.card.data.name) || '',
  ).trim();
  const name = String(job.name || params.name || '').trim();
  const material = String(job.material || '').trim();
  const sys =
    COMMON_RULES +
    (['opening', 'status', 'worldrule', 'topics'].includes(tpl.id) ? TPL_TEXT[tpl.id] : '\n\n' + TPL_TEXT[tpl.id]);
  let user = `【作品】${work || '（作者未指定）'}\n${cardContext(ctx.card)}${loreBlock(ctx.lore)}`;
  if (ctx.roster)
    user +=
      '\n【作者的角色清单】\n' +
      (typeof ctx.roster === 'string'
        ? ctx.roster
        : ctx.roster.map(item => (typeof item === 'string' ? item : item.name || '')).join('\n')) +
      '\n';
  // 一次性输出完整时间线时，专属资料（多半是小说原文）整段发出去，不然后半截剧情根本没进提示词
  const materialCap = tpl.kind === 'timeline' && params.whole ? Infinity : 12000;
  if (material)
    user +=
      '\n【这一件的专属资料】\n' +
      material.slice(0, materialCap) +
      '\n' +
      (material.length > materialCap
        ? '【资料长度说明】专属资料只发了前 12000 字符；后面的内容不在本次范围内。\n'
        : '');
  if (tpl.kind === 'chara')
    user +=
      '\n【本次角色】' +
      (params.characterName || name || '（作者未指定）') +
      '\n只生成这一位角色的完整资料；标签名与角色名一致。';
  else if (tpl.kind === 'timeline') {
    if (params.whole) {
      if (params.start) user += `\n【起始日期】时间线从 ${params.start} 开始往后排`;
      user +=
        '\n【范围】一次性输出完：把资料里的全部剧情从头写到尾，放进同一个 <world_timeline>，不要只写某一个篇章，也不要停下来等续写。结尾固定是「沙盒模式 (日期起 - ∞)」。';
    } else {
      user += `\n【篇章】${params.arc || '（作者没指定，按资料里的范围来）'}\n`;
      if (params.start) user += `【起始日期】这个篇章从 ${params.start} 开始往后排\n`;
      user += '只输出这一个篇章的 <world_timeline>，结尾固定是「沙盒模式 (日期起 - ∞)」。';
    }
    user += '\n' + TIMELINE_NAME_RULE;
  } else if (tpl.kind === 'setting')
    user += '\n按这个作品的体系，把主要力量体系、组织、关键道具或机制各拆成独立的 <设定_名称> 标签，一次输出 3~6 个。';
  else if (tpl.kind === 'place') user += '\n生成 3~5 个地点，每个用独立的 <地点:地点名> 标签包裹。';
  if (name && tpl.kind !== 'chara' && name !== tpl.name) user += '\n【本件标题或范围】' + name;
  if (tpl.wave > 1)
    user += '\n必须引用上面已有条目中成立的人物、地点、机制和时间锚点。不要凭空补出上下文没有的专有地名或已确定日期。';
  return { sys, user };
}

function generatedId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, x => x.toString(16).padStart(2, '0')).join('');
  return (
    hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20)
  );
}

// 标签只作为文本解析；不修补、不执行生成的正文。
function pairedGeneratedBlocks(text, accepts, label) {
  const tokens = [...text.matchAll(/<(\/?)((?:[^<>\r\n])+)>/g)].filter(match => accepts(match[2]));
  const out = [];
  let current = null;
  for (const token of tokens) {
    if (!token[1]) {
      if (current) throw new Error(label + '标签尚未闭合，不能装入卡。');
      current = { tag: token[2], start: token.index, bodyStart: token.index + token[0].length };
    } else {
      if (!current || current.tag !== token[2]) throw new Error(label + '开闭标签不匹配，不能装入卡。');
      const end = token.index + token[0].length;
      if (!text.slice(current.bodyStart, token.index).trim()) throw new Error(label + '标签内没有正文。');
      out.push({ tag: current.tag, text: text.slice(current.start, end) });
      current = null;
    }
  }
  if (current) throw new Error(label + '缺少闭合标签，不能装入卡。');
  if (!out.length) throw new Error('没有解析到完整的' + label + '标签。');
  return out;
}

function prepareGenerated(tplId, text, name = '', params = {}) {
  const tpl = TEMPLATES.find(t => t.id === tplId);
  if (!tpl) throw new Error('未知模板：' + tplId);
  text = String(text || '');
  if (!text.trim()) throw new Error('生成正文为空。');
  const entries = [];
  const push = (comment, content, keys = [], extra = {}) => {
    const entry = {
      id: 0,
      keys,
      secondary_keys: [],
      comment,
      content,
      constant: !keys.length,
      selective: true,
      insertion_order: 100,
      enabled: true,
      position: 'after_char',
      extensions: JSON.parse(JSON.stringify(EXT_TPL)),
      use_regex: false,
      __miemieId: generatedId(),
      __tplId: tplId,
      ...extra,
    };
    entries.push(entry);
    return entry;
  };
  if (tpl.kind === 'opening') {
    const opening = pairedGeneratedBlocks(text, tag => tag === 'opening', '开场白').map(block => block.text);
    return { entries, opening };
  }
  if (tpl.kind === 'chara') {
    const blocks = pairedGeneratedBlocks(text, tag => /^[^<>\s]+\s?character$/.test(tag), '角色');
    for (const block of blocks) {
      const characterName =
        (block.text.match(/^名字:\s*(.+)$/m) || [])[1] || block.tag.replace(/\s?character$/, '') || name;
      const entry = push('角色:' + characterName.trim(), block.text, [characterName.trim()]);
      if (/性别\s*[:：]\s*(?:其他|未知|无性别|非二元)/.test(block.text))
        entry.comment = '其他角色:' + characterName.trim();
      else {
        const gender = genderOf(entry);
        if (gender.sure) entry.comment = (gender.seg === 'male' ? '男 ' : '女 ') + characterName.trim();
      }
    }
  } else if (tpl.kind === 'timeline') {
    pairedGeneratedBlocks(text, tag => tag === 'world_timeline', '时间线').forEach((block, i) =>
      push(
        '时间线-' +
          ((params.whole ? '' : params.arc) || (name && name !== tpl.name ? name : params.whole ? '完整' : '篇章')) +
          (i ? ' ' + (i + 1) : '') +
          '(多选一)',
        block.text,
      ),
    );
  } else if (tpl.kind === 'setting') {
    pairedGeneratedBlocks(text, tag => /^设定_.+/.test(tag), '设定').forEach(block => {
      const title = block.tag.slice(3);
      push('核心设定:' + title, block.text, [title]);
    });
  } else if (tpl.kind === 'place') {
    pairedGeneratedBlocks(text, tag => /^地点[:：].+/.test(tag), '地点').forEach(block => {
      const title = block.tag.slice(3);
      push('地点:' + title, block.text, [title]);
    });
  } else if (tpl.kind === 'status') {
    pairedGeneratedBlocks(text, tag => tag === 'status_format', '状态栏格式');
    pairedGeneratedBlocks(text, tag => tag === 'status', '状态栏');
    if (!/\{\{setvar::status_format::/.test(text) || !/\}\}\s*$/.test(text))
      throw new Error('状态栏缺少完整的 setvar 壳。');
    push('输出：状态栏', text);
  } else if (tpl.kind === 'worldrule') {
    pairedGeneratedBlocks(text, tag => /^核心规则[:：].+/.test(tag), '核心规则').forEach(block =>
      push(block.tag, block.text),
    );
  } else if (tpl.kind === 'topics') {
    pairedGeneratedBlocks(text, tag => tag === 'easter_eggs', '开放性话题池');
    push('核心规则：开放性话题池', text);
  }
  if (!entries.length) throw new Error('没有可装入卡的条目。');
  return { entries };
}

function applyGen(job, text) {
  // 先完整解析，再触碰卡；任何解析错误都保留旧正文。
  const prepared = prepareGenerated(job.tplId, text, job.name, job.params || {});
  if (!S.card || !S.card.data) throw new Error('先新建或导入一张卡，再装入生成件。');
  const d = S.card.data;
  if (prepared.opening) {
    const prior = new Set(Array.isArray(job.appliedOpenings) ? job.appliedOpenings : []);
    const first = String(d.first_mes || '');
    const existing = [first, ...(Array.isArray(d.alternate_greetings) ? d.alternate_greetings : [])].filter(
      value => value && !prior.has(value),
    );
    const generated = prepared.opening;
    if (!first || prior.has(first)) {
      d.first_mes = generated[0];
      d.alternate_greetings = [...generated.slice(1), ...existing].filter(
        (value, i, list) => value !== d.first_mes && list.indexOf(value) === i,
      );
    } else {
      d.alternate_greetings = [...existing.filter(value => value !== first), ...generated].filter(
        (value, i, list) => value !== first && list.indexOf(value) === i,
      );
    }
    job.appliedOpenings = generated.slice();
    job.appliedIds = [];
    return prepared;
  }
  const old = d.character_book && Array.isArray(d.character_book.entries) ? d.character_book.entries : [];
  const ids = new Set(Array.isArray(job.appliedIds) ? job.appliedIds : []);
  const overridesById = new Map(Array.from(S.overrides || [], ([i, seg]) => [old[i]?.__miemieId, seg]));
  const replacedByName = new Map(
    old.filter(e => ids.has(e.__miemieId)).map(e => [e.comment, overridesById.get(e.__miemieId)]),
  );
  const kept = old.filter(entry => !ids.has(entry.__miemieId));
  const tpl = TEMPLATES.find(t => t.id === job.tplId);
  if (tpl.kind === 'timeline') {
    const hasActive = kept.some(entry => entry.enabled !== false && /<world_timeline>/.test(entry.content || ''));
    const previousActive = old.some(entry => ids.has(entry.__miemieId) && entry.enabled !== false);
    prepared.entries.forEach((entry, i) => {
      entry.enabled = i === 0 && (!hasActive || previousActive);
    });
  }
  const next = [...kept, ...prepared.entries];
  if (!d.character_book) d.character_book = { name: (d.name || '未命名') + '世界书', entries: next };
  else d.character_book.entries = next;
  if (S.overrides instanceof Map) {
    S.overrides = new Map();
    next.forEach((entry, i) => {
      const seg = overridesById.get(entry.__miemieId) || replacedByName.get(entry.comment);
      if (seg) S.overrides.set(i, seg);
    });
  }
  job.appliedIds = prepared.entries.map(entry => entry.__miemieId);
  S.lastAssembly = null;
  return prepared;
}
