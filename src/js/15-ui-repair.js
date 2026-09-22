/* ════════ 十五、界面 · 修卡台 ════════ */
/* 《咩咩修卡台》的整条链：体检 → 当场修结构 → 逐条改前改后 → 补缺件 / 照模板重铸 → 拿走。
   和流水线共用 diagnose / assembleCard / checkText / 模板 / 接口；工程放在 R，不进 IndexedDB，刷新即清空。 */

// 修卡台原样：只重铸这四类。状态栏、规则、话题池常带作者自己的变量和正则设计，不自动改写。
const RECAST_KINDS = ['chara', 'place', 'setting', 'timeline'];
const POS_NAMES = {
  0: '人设前',
  1: '人设后',
  2: '作者注释前',
  3: '作者注释后',
  5: '示例消息前',
  6: '示例消息后',
  7: 'Outlet',
};
const PART_TPL = {
  chara: 'charV2',
  setting: 'setting',
  place: 'place',
  worldrule: 'worldrule',
  timeline: 'tlTVD',
  status: 'status',
  topics: 'topics',
  opening: 'opening',
};

function posLabel(e) {
  const n = e.extensions?.position ?? POS_NUM[e.position] ?? 1;
  return n === 4 ? '@深度 ' + (e.extensions?.depth ?? 4) : POS_NAMES[n] || '人设后';
}
function kindOf(tplId) {
  return /^charV[12]$/.test(tplId) ? 'chara' : /^tl[A-Z]/.test(tplId) ? 'timeline' : tplId;
}
function repairWork() {
  return String(R.raw?.data.name || '')
    .replace(/[-—·].*$/, '')
    .trim();
}
function repairEntries() {
  return R.fixed?.card.data.character_book?.entries || [];
}
function cleanFence(text) {
  return String(text || '')
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}
function setRailStep(n) {
  $$('[data-rstep]').forEach(el => {
    if (+el.dataset.rstep === n) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });
}
function goRepairStep(n) {
  if (currentTab !== 'repair') showTab('repair');
  $('#rstep' + n)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setRailStep(n);
}

/* ── 体检 + 修：每次改动（换分区、换开关、装回重铸稿、装新件）都从原卡重跑一遍 ── */
function repairRun() {
  if (!R.raw) return;
  const src = R.raw.data.character_book.entries;
  src.forEach(e => {
    if (!e.__miemieId) e.__miemieId = generatedId();
  });
  const plan = buildPlan(src, R.overrides);
  R.plan = plan;
  R.health = detectHealth(src);
  R.guessRate = src.length ? src.filter((e, i) => plan.get(i).guessed).length / src.length : 0;
  R.issues = diagnose(R.raw, plan).map(i => ({ ...i, p: String(i.p || '').replace('第 ④ 步', '第 03 步') }));
  for (const s of R.shape.slice(1))
    if (!/chara_card_v3 3\.0/.test(s))
      R.issues.push({
        lv: 'info',
        t: '读的时候顺手换了格式',
        p: s + '，已经转成酒馆认的 chara_card_v3。',
        tech: '',
        kind: 'style',
      });
  R.fixed = assembleCard(R.raw, R.overrides, R.opt);
  R.diff = repairDiff(src, repairEntries());
  renderRepair();
}

/** 按 __miemieId 把修后的条目对回原卡，逐字段记改前改后。标记条目、新补的清空条目没有原件，不进表。 */
function repairDiff(before, after) {
  const byId = new Map(before.map(e => [e.__miemieId, e])),
    out = new Map();
  for (const e of after) {
    const old = e.__miemieId && byId.get(e.__miemieId);
    if (!old) continue;
    const rec = {},
      put = (field, was, now) => {
        if (String(was) !== String(now)) rec[field] = { was, now };
      };
    put('order', old.insertion_order, e.insertion_order);
    put('position', posLabel(old), posLabel(e));
    put('constant', old.constant ? '常驻' : '触发', e.constant ? '常驻' : '触发');
    put('enabled', old.enabled === false ? '关' : '开', e.enabled === false ? '关' : '开');
    put('keys', (old.keys || []).length, (e.keys || []).length);
    put('comment', old.comment || '（空）', e.comment || '（空）');
    if (Object.keys(rec).length) out.set(e, rec);
  }
  return out;
}

async function repairLoad(file) {
  if (!file || !guardIdle()) return;
  repairBusy = true;
  renderBusy();
  const prev = { ...R };
  try {
    if (file.size > 64 * 1024 * 1024) throw new Error('文件超过 64 MB，请先减小图片或卡数据。');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text,
      png = null,
      how;
    if (bytes[0] === 137 && bytes[1] === 80) {
      const r = await extractFromPng(bytes);
      text = r.text;
      png = bytes;
      how = `PNG 内嵌：${r.keys.join(' + ')}`;
    } else {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      how = 'JSON 文件';
    }
    const normalized = normalize(looseParse(text)),
      filename = file.name.replace(/\.(png|json|txt)$/i, '');
    if (normalized.shape.includes('已将独立世界书装入空白角色卡')) normalized.card.data.name = filename;
    Object.assign(R, {
      raw: normalized.card,
      shape: [how, ...normalized.shape],
      filename,
      png,
      art: null,
      overrides: new Map(),
      opt: { ...DEFAULT_ASSEMBLY_OPT },
      touched: new Set(),
      genIds: new Set(),
    });
    RC.results = [];
    Object.assign(RG, { part: null, form: false, text: '', error: '' });
    try {
      repairRun();
    } catch (e) {
      Object.assign(R, prev);
      renderRepair();
      throw e;
    }
  } finally {
    repairBusy = false;
    renderBusy();
  }
  goRepairStep(2);
  toast('读进来了，结构已经当场修好，正文没动');
}

/* ── 渲染 ── */
function renderRepair() {
  const has = !!R.fixed;
  for (let i = 2; i <= 5; i++) $('#rstep' + i).classList.toggle('idle', !has);
  if (!has) {
    $('#repair-source').innerHTML = '';
    renderRepairBusy();
    return;
  }
  const d = R.fixed.card.data;
  $('#repair-source').innerHTML =
    `<span class="pill">${icon('book', 13)} ${esc(d.name)}</span><span class="mono muted">${repairEntries().length} 条目</span><span class="muted">${esc(R.shape[0] || '')}</span>`;
  renderRepairFaults();
  renderRepairFixed();
  renderRepairParts();
  renderRepairFormat();
  renderRepairGen();
  renderRepairRecast();
  renderRepairExport();
  renderRepairBusy();
}

function renderRepairFaults() {
  const hard = R.issues.filter(i => i.kind !== 'style'),
    style = R.issues.filter(i => i.kind === 'style');
  const crit = hard.filter(i => i.lv === 'crit').length,
    warn = hard.filter(i => i.lv === 'warn').length;
  $('#repair-health').innerHTML =
    crit || warn
      ? `${crit ? `<span class="pill"><b class="crit">要命 ${crit}</b></span>` : ''}${warn ? `<span class="pill"><b class="warn">小毛病 ${warn}</b></span>` : ''}<span class="muted">结构上的毛病第 03 步已经修了，缺的内容去第 04 步补</span>`
      : `<span class="ok">${icon('check', 13)} 结构没坏</span>`;
  $('#repair-faults').innerHTML = hard.map(faultMarkup).join('');
  $('#repair-convention').hidden = !style.length;
  $('#repair-convention-summary').textContent = `还有 ${style.length} 条「不合咩咩母版，但不算坏」`;
  $('#repair-convention-list').innerHTML = style.map(faultMarkup).join('');
}

function renderRepairFixed() {
  const box = $('#repair-fixed'),
    es = repairEntries(),
    acts = R.fixed.acts || [];
  const added = es.filter(e => e.__new).length,
    touched = R.touched.size,
    gen = R.genIds.size;
  const keep = Object.fromEntries($$('#repair-fixed details[data-k]').map(el => [el.dataset.k, el.open]));
  const why = R.health.needRebuild
    ? '这张卡原本基本没有结构可言（序号全一样，或者全堆在人设前），已按咩咩母版从头排了一遍。'
    : R.health.isMiemie
      ? '本来就是咩咩体系的卡，已按母版重新归位。'
      : '已按咩咩母版重整：分区、序号、注入位置、分区标记全部归位。';
  const guess =
    R.guessRate > 0.4
      ? `<p class="notice">有 ${Math.round(R.guessRate * 100)}% 的条目从名字看不出该进哪个分区（它原来的命名不是咩咩那套），这些是按「有关键词算角色、没关键词算规则」硬分的。在下面的明细表里逐条改分区。</p>`
      : '';
  box.innerHTML = `
    <div class="done-line"><span class="big-n">${R.diff.size}</span><span>条改过，</span><span class="big-n">${added}</span><span>条是补上的，现在一共 ${es.length} 条。</span></div>
    <p class="source-note" style="margin-top:0">${why}原文件没动过；${touched ? `正文除了你挑着装回来的 ${touched} 条重铸稿，其余` : '条目正文'}一个字没碰。${gen ? `另有 ${gen} 条是 AI 补写的新件，表里标着「AI」。` : ''}</p>${guess}
    <ul class="fix-list">${acts.map(a => `<li>${esc(a)}</li>`).join('') || '<li>结构本来就是对的，什么都没动</li>'}</ul>
    <details class="details-box" data-k="table"><summary>看每条改了什么 · 可以逐条改分区（${es.length} 条）</summary>${repairEntryTable(es)}</details>
    <details class="details-box" data-k="opt"><summary>细项，我想自己挑</summary><div class="switches">${OPT_LABELS.map(([k, l]) => `<label><input type="checkbox" data-repair-opt="${k}" ${R.opt[k] ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div></details>`;
  $$('#repair-fixed details[data-k]').forEach(el => {
    if (el.dataset.k in keep) el.open = keep[el.dataset.k];
  });
}

function repairEntryTable(es) {
  const srcIndex = new Map(R.raw.data.character_book.entries.map((e, i) => [e.__miemieId, i])),
    bounds = {};
  es.forEach(e => {
    const s = SEG[e.__seg] ? e.__seg : 'rule',
      o = Number(e.insertion_order);
    bounds[s] = bounds[s] ? [Math.max(bounds[s][0], o), Math.min(bounds[s][1], o)] : [o, o];
  });
  let seg = null,
    rows = '';
  for (const e of es) {
    const s = SEG[e.__seg] ? e.__seg : 'rule';
    if (s !== seg) {
      seg = s;
      rows += `<tr class="seg-row"><td colspan="7"><i class="seg-dot" style="background:var(--seg-${s})"></i> ${esc(segLabel(s))} <span class="mono">${bounds[s][0]}–${bounds[s][1]}</span></td></tr>`;
    }
    const c = R.diff.get(e) || {},
      marker = MARKER_RE.test((e.comment || '').trim()),
      i = srcIndex.get(e.__miemieId);
    const cell = (f, now) =>
      c[f] ? `<span class="was">${esc(c[f].was)}</span><span class="now">${esc(c[f].now)}</span>` : esc(now);
    const select =
      i === undefined || marker || s === 'clear'
        ? '<span class="muted">—</span>'
        : `<select data-repair-seg="${i}" aria-label="${esc(e.comment)} 分区">${SEGMENTS.filter(x => x.id !== 'clear')
            .map(x => `<option value="${x.id}" ${x.id === s ? 'selected' : ''}>${esc(segLabel(x.id))}</option>`)
            .join('')}</select>`;
    const badge = e.__new
      ? ' <span class="tag fresh">新</span>'
      : R.genIds.has(e.__miemieId)
        ? ' <span class="tag fresh">AI</span>'
        : R.touched.has(e.__miemieId)
          ? ' <span class="tag fresh">重铸</span>'
          : '';
    const keys = c.keys
      ? cell('keys', (e.keys || []).length)
      : (e.keys || []).length || (e.constant || marker ? '—' : '<span class="crit">0</span>');
    rows += `<tr class="${marker ? 'marker' : ''}"><td>${select}</td><td class="mono">${cell('order', e.insertion_order)}${badge}</td><td>${cell('position', posLabel(e))}</td><td>${cell('constant', e.constant ? '常驻' : '触发')}</td><td><span class="tag ${e.enabled !== false ? 'on' : ''}">${cell('enabled', e.enabled !== false ? '开' : '关')}</span></td><td class="mono">${keys}</td><td>${marker || !e.__miemieId ? esc(e.comment) : `<button class="entry-name" data-repair-view="${esc(e.__miemieId)}" title="看正文：${esc(e.comment)}">${cell('comment', e.comment || '未命名条目')}</button>`}</td></tr>`;
  }
  return `<div class="entry-table-wrap"><table class="entry-table"><thead><tr><th>分区</th><th>序号</th><th>位置</th><th>常驻</th><th>开关</th><th>关键词</th><th>条目名</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function repairView(id) {
  const e = repairEntries().find(x => x.__miemieId === id);
  if (!e) return;
  const tplId = detectEntryTemplate(e),
    q = tplId ? checkText(tplId, e.content || '') : null;
  inspected = null;
  $('#inspect-heading').textContent = e.comment || '未命名条目';
  $('#inspect-text').value = e.content || '';
  $('#inspect-text').readOnly = true;
  $('#inspect-note').textContent = '修卡台里正文只读。要换正文，用第 04 步的「照模板重铸」，写好了挑着装回来。';
  $('#inspect-save').hidden = true;
  $('#inspect-regenerate').hidden = true;
  $('#inspect-reasoning-box').hidden = true;
  $('#inspect-qc').textContent = q
    ? q.ok
      ? '格式检查通过。'
      : q.issues.map(i => i.msg).join('；')
    : '这类条目没有对应的咩咩模板，不做格式检查。';
  showDialog('#inspect-modal');
}

function renderRepairParts() {
  const parts = checkParts(R.fixed.card, []),
    lack = parts.filter(p => !p.ok).length;
  $('#repair-parts-count').textContent = lack ? `缺 ${lack} 类` : '件齐了';
  $('#repair-parts').innerHTML = parts
    .map(
      p =>
        `<div class="part-row"><span class="${p.ok ? 'ok' : 'muted'}">${icon(p.ok ? 'check' : 'circle', 15)}</span><span title="${esc(p.want)}">${esc(p.name)}</span><span class="part-got">${esc(p.got)} · ${esc(p.want)}</span>${p.ok ? `<button class="text-btn" data-repair-gen="${esc(p.id)}">再写一件</button>` : `<button class="btn btn-sm" data-repair-gen="${esc(p.id)}">让 AI 写</button>`}</div>`,
    )
    .join('');
}

/* ── 正文格式：按分区判该套哪份模板，不合的列出来，四类可以重铸 ── */
function repairFormatList() {
  const out = [];
  for (const e of repairEntries()) {
    if (MARKER_RE.test((e.comment || '').trim()) || /清空局部变量/.test(e.comment || '') || !(e.content || '').trim())
      continue;
    const tplId = detectEntryTemplate(e);
    if (!tplId) continue;
    const kind = kindOf(tplId),
      q = checkText(tplId, e.content);
    if (q.ok) continue;
    out.push({
      e,
      kind,
      label: CHECK[kind]?.label || kind,
      recast: RECAST_KINDS.includes(kind),
      tplId: kind === 'chara' ? 'charV2' : kind === 'timeline' ? 'tlTVD' : tplId,
      miss: q.issues.filter(i => i.lv === 'crit').map(i => i.msg),
    });
  }
  return out;
}

function renderRepairFormat() {
  const box = $('#repair-format'),
    total = meaningfulEntries(R.fixed.card).length;
  if (!total) {
    box.innerHTML = '';
    return;
  }
  const bad = repairFormatList(),
    can = bad.filter(b => b.recast),
    skip = bad.filter(b => !b.recast);
  let html = '<div class="section-title">正文格式 <span class="small">光有结构不够，正文得照咩咩模板写</span></div>';
  if (!bad.length) {
    box.innerHTML =
      html +
      `<div class="part-row"><span class="ok">${icon('check', 15)}</span><span>${total} 条正文</span><span class="part-got">都合咩咩模板：角色四槽、地点标题、设定分类、时间线编号都在</span><span></span></div>`;
    return;
  }
  const groups = {};
  bad.forEach(b => (groups[b.label] ||= []).push(b));
  const common = list => {
    const c = {};
    list.forEach(b =>
      b.miss.forEach(m => {
        c[m] = (c[m] || 0) + 1;
      }),
    );
    return Object.entries(c)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([m, n]) => `${m}（${n} 条）`)
      .join('、');
  };
  html += Object.entries(groups)
    .map(
      ([label, list]) =>
        `<div class="part-row"><span class="warn">${icon('warning', 15)}</span><span>${esc(label)} · ${list.length} 条</span><span class="part-got">${esc(common(list))}</span><span class="small muted">${list[0].recast ? '可重铸' : '只提示'}</span></div>`,
    )
    .join('');
  if (skip.length)
    html +=
      '<p class="source-note">状态栏、规则、话题池这类常带作者自己的变量和正则设计，不自动重铸。真要改，送进出卡流水线后在零件台重写那一件。</p>';
  if (can.length)
    html += `<div class="inline-tools" style="margin-top:14px"><button class="btn-primary" id="repair-recast-start">${icon('refresh')}照模板重铸这 ${can.length} 条</button><span class="small muted">拿原文当资料改写，不是重新编。写好了逐条挑着装，没勾的原样保留。</span></div>`;
  box.innerHTML = html;
}

function recastPrompt(item) {
  const sys = COMMON_RULES + '\n\n' + TPL_TEXT[item.tplId];
  const user =
    `【作品】${repairWork() || '（作者未指定）'}\n【这一条的条目名】${item.e.comment || '未命名条目'}\n` +
    `【这条现在的正文】\n${String(item.e.content || '').slice(0, 12000)}\n` +
    loreBlock(R.lore) +
    '\n把上面这条正文改写成规定格式，原有信息一条都不要丢；模板要求而原文没有的栏位，按这个作品的常识克制补全。只改写这一条，不要输出别的条目。' +
    (item.kind === 'timeline' ? '\n' + TIMELINE_NAME_RULE : '');
  return { sys, user };
}

async function repairRecastAll() {
  if (!guardIdle()) return;
  if (!cfg.base || !cfg.model) {
    openApi();
    toast('先配置接口，重铸要一条条问 AI。');
    return;
  }
  const list = repairFormatList().filter(b => b.recast);
  if (!list.length) return;
  Object.assign(RC, {
    running: true,
    abort: false,
    done: 0,
    total: list.length,
    results: list,
    controller: new AbortController(),
  });
  renderBusy();
  renderRepairRecast();
  let cursor = 0;
  const worker = async () => {
    while (cursor < list.length && !RC.abort) {
      const item = list[cursor++];
      try {
        const p = recastPrompt(item),
          res = await ask(p.sys, p.user, { signal: RC.controller.signal });
        item.newText = cleanFence(res.text);
        const q = checkText(item.tplId, item.newText);
        item.ok = q.ok;
        item.issues = q.issues.map(i => i.msg);
      } catch (err) {
        if (err.name === 'AbortError') {
          item.error = '停下了，没写完';
          break;
        }
        item.error = err.message;
      }
      RC.done++;
      renderRepairRecast();
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(3, list.length) }, worker));
  } finally {
    // 同时最多三条，免得把接口打爆
    RC.running = false;
    RC.controller = null;
    renderBusy();
    renderRepairRecast();
  }
}

function renderRepairRecast() {
  const box = $('#repair-recast');
  if (RC.running) {
    box.innerHTML = `<div class="rc-box"><div class="rc-head"><span class="spin"></span>正在重铸 ${RC.done} / ${RC.total} 条<button class="btn btn-sm btn-danger" id="repair-recast-stop">${icon('stop', 14)}停下</button></div><div class="queue-progress"><span style="width:${RC.total ? (RC.done / RC.total) * 100 : 0}%"></span></div><p class="source-note">同时最多写三条。停下后，已经写好的还在，照样可以挑着装。</p></div>`;
    return;
  }
  const done = RC.results.filter(b => b.newText),
    failed = RC.results.filter(b => b.error && !b.newText);
  if (!done.length && !failed.length) {
    box.innerHTML = '';
    return;
  }
  const good = done.filter(b => b.ok).length;
  box.innerHTML =
    `<div class="rc-box"><div class="rc-head">重铸好了 ${done.length} 条<small>${good} 条合格${done.length - good ? `，${done.length - good} 条格式仍不达标（默认不勾，可以看完再决定）` : ''}${failed.length ? `，${failed.length} 条没写成` : ''}</small></div>` +
    (done.length
      ? `<div class="rc-list">${done.map((b, i) => `<div class="rc-item"><input type="checkbox" id="rc-${i}" data-rc="${i}" ${(b.pick ?? b.ok) ? 'checked' : ''}><label class="rc-n" for="rc-${i}">${b.ok ? '' : `<span class="warn">${icon('warning', 13)}</span> `}${esc(b.e.comment || '未命名条目')}</label><span class="small muted">${b.newText.length.toLocaleString()} 字</span><details><summary>看看新正文${b.ok ? '' : ' · ' + esc(b.issues.slice(0, 2).join('；'))}</summary><textarea readonly>${esc(b.newText)}</textarea></details></div>`).join('')}</div>`
      : '') +
    (failed.length
      ? `<p class="source-note"><span class="crit">${failed.map(b => esc((b.e.comment || '未命名条目') + '：' + b.error)).join('<br>')}</span></p>`
      : '') +
    `<div class="inline-tools" style="margin-top:12px">${done.length ? `<button class="btn-primary" id="repair-recast-apply">${icon('check')}把勾上的装进卡里</button>` : ''}<button class="btn" id="repair-recast-drop">全部丢掉</button></div></div>`;
}

function repairRecastApply() {
  if (!guardIdle()) return;
  const done = RC.results.filter(b => b.newText);
  const picked = done.filter(b => b.pick ?? b.ok);
  if (!picked.length) {
    toast('一条都没勾。');
    return;
  }
  const byId = new Map(R.raw.data.character_book.entries.map(e => [e.__miemieId, e]));
  let n = 0;
  for (const b of picked) {
    const src = byId.get(b.e.__miemieId);
    if (src) {
      src.content = b.newText;
      R.touched.add(src.__miemieId);
      n++;
    }
  }
  RC.results = [];
  repairRun();
  toast(`${n} 条正文换成了重铸稿，没勾的原样保留`);
}

/* ── 补缺件：套流水线同一份模板和提示词，只是上下文换成这张卡 ── */
function repairGenStart(partId) {
  if (!guardIdle()) return;
  Object.assign(RG, {
    part: partId,
    tplId: PART_TPL[partId],
    params: { name: '', material: '', arc: '', start: '', whole: false },
    form: true,
    running: false,
    text: '',
    error: '',
  });
  renderRepairGen();
  $('#repair-genbox').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function repairGenRun() {
  if (!guardIdle()) return;
  const tpl = TEMPLATES.find(t => t.id === RG.tplId);
  Object.assign(RG.params, {
    name: $('#rg-name').value.trim(),
    material: $('#rg-material').value,
    arc: $('#rg-arc')?.value.trim() || '',
    start: $('#rg-start')?.value.trim() || '',
    whole: $('#rg-scope')?.value === 'whole',
  });
  if (tpl.kind === 'chara' && !RG.params.name) {
    toast('先写这次要写谁。');
    $('#rg-name').focus();
    return;
  }
  if (!cfg.base || !cfg.model) {
    openApi();
    toast('先配置接口，再让 AI 写。');
    return;
  }
  const job = {
    tplId: RG.tplId,
    name: RG.params.name,
    material: RG.params.material,
    params: { arc: RG.params.arc, start: RG.params.start, whole: !!RG.params.whole, characterName: RG.params.name },
  };
  const prompt = buildJobPrompt(job, { lore: { ...R.lore, work: repairWork() }, card: R.fixed.card, roster: '' });
  Object.assign(RG, { form: false, running: true, text: '', error: '', controller: new AbortController() });
  renderBusy();
  renderRepairGen();
  try {
    const res = await ask(prompt.sys, prompt.user, {
      signal: RG.controller.signal,
      onText: t => {
        RG.text = t;
        const s = $('#rg-stream');
        if (s) {
          s.textContent = t;
          s.scrollTop = s.scrollHeight;
        }
      },
    });
    RG.text = cleanFence(res.text);
  } catch (e) {
    if (e.name !== 'AbortError') RG.error = e.message;
    else if (!RG.text.trim()) RG.error = '停下了，没写出东西。';
    else RG.text = cleanFence(RG.text);
  } finally {
    RG.running = false;
    RG.controller = null;
    renderBusy();
    renderRepairGen();
  }
}

function renderRepairGen() {
  const box = $('#repair-genbox');
  if (!RG.part) {
    box.innerHTML = '';
    return;
  }
  const tpl = TEMPLATES.find(t => t.id === RG.tplId),
    p = RG.params;
  if (RG.form) {
    const tl = tpl.kind === 'timeline';
    box.innerHTML = `<div class="rc-box"><div class="rc-head">写${esc(tpl.kind === 'timeline' ? '时间线' : tpl.name)}之前，先定几件事</div>
      <div class="form-grid" style="margin-top:14px"><label class="field"><span>${tpl.kind === 'chara' ? '这次写谁（必填）' : '标题或范围（可空）'}</span><input id="rg-name" value="${esc(p.name)}" placeholder="${tpl.kind === 'chara' ? '例如：户山香澄' : '空着就交给 AI 按资料定'}"></label>
      ${
        tl
          ? `<label class="field"><span>时间线怎么切</span><select id="rg-tpl">${TEMPLATES.filter(
              t => t.kind === 'timeline',
            )
              .map(t => `<option value="${t.id}" ${t.id === RG.tplId ? 'selected' : ''}>${esc(t.name)}</option>`)
              .join(
                '',
              )}</select></label><label class="field"><span>生成范围</span><select id="rg-scope"><option value="arc" ${p.whole ? '' : 'selected'}>只写一个篇章</option><option value="whole" ${p.whole ? 'selected' : ''}>一次性输出完（体量小的作品）</option></select></label><label class="field"><span>篇章</span><input id="rg-arc" value="${esc(p.arc)}" placeholder="第一季 / 第 01 卷"></label><label class="field"><span>起始日期</span><input id="rg-start" value="${esc(p.start)}" placeholder="例如：2019年4月1日"></label>`
          : ''
      }</div>
      <label class="field"><span>这件的专属资料（可空）</span><textarea id="rg-material" rows="3" placeholder="只给这一件用的补充资料。上面的原作资料会一起带上。">${esc(p.material)}</textarea></label>
      <div class="inline-tools"><button class="btn-primary" id="rg-go">${icon('play')}开写</button><button class="btn" id="rg-cancel">算了</button></div>
      <p class="source-note">会把这张卡现有条目的摘要（每条前 200 字）和上面的原作资料一起发给你配置的接口。</p></div>`;
    return;
  }
  if (RG.running) {
    box.innerHTML = `<div class="rc-box"><div class="rc-head"><span class="spin"></span>正在写${esc(tpl.name)}${p.name ? ' · ' + esc(p.name) : ''}<button class="btn btn-sm btn-danger" id="rg-stop">${icon('stop', 14)}停下</button></div><div class="live-stream" id="rg-stream">${esc(RG.text)}</div></div>`;
    return;
  }
  if (RG.error) {
    box.innerHTML = `<div class="rc-box"><div class="rc-head">没写成</div><p class="source-note"><span class="crit">${esc(RG.error)}</span></p><div class="inline-tools"><button class="btn" id="rg-retry">改一下再写</button><button class="btn" id="rg-drop">算了</button></div></div>`;
    return;
  }
  const q = checkText(RG.tplId, RG.text);
  box.innerHTML = `<div class="rc-box"><div class="rc-head">${esc(tpl.name)}写好了${p.name ? ' · ' + esc(p.name) : ''}<small>可以直接在下面改，改完再装</small></div>
    <textarea id="rg-text" class="entry-text" style="margin-top:12px" aria-label="生成的正文，可手改">${esc(RG.text)}</textarea>
    <div id="rg-qc" class="qc-line ${q.ok ? 'ok' : 'warn'}">${esc(q.ok ? '格式检查通过，可以装进卡里。' : q.issues.map(i => i.msg).join('；'))}</div>
    <div class="inline-tools"><button class="btn-primary" id="rg-apply">${icon('plus')}装进卡里</button><button class="btn" id="rg-retry">重写</button><button class="btn" id="rg-drop">丢掉</button></div></div>`;
}

function repairGenApply() {
  if (!guardIdle()) return;
  const text = $('#rg-text').value,
    q = checkText(RG.tplId, text);
  if (!q.ok) {
    toast(
      '格式还没通过：' +
        q.issues
          .map(i => i.msg)
          .slice(0, 2)
          .join('；'),
    );
    return;
  }
  const tpl = TEMPLATES.find(t => t.id === RG.tplId),
    d = R.raw.data;
  const prepared = prepareGenerated(RG.tplId, text, RG.params.name, {
    arc: RG.params.arc,
    start: RG.params.start,
    whole: !!RG.params.whole,
  });
  if (prepared.opening) {
    if (!String(d.first_mes || '').trim()) {
      d.first_mes = prepared.opening[0];
      d.alternate_greetings = [...d.alternate_greetings, ...prepared.opening.slice(1)];
    } else d.alternate_greetings = [...d.alternate_greetings, ...prepared.opening];
    d.alternate_greetings = d.alternate_greetings.filter((v, i, a) => v && v !== d.first_mes && a.indexOf(v) === i);
  } else {
    const old = d.character_book.entries;
    // 时间线多选一：卡里已经开着一条，新写的就先关着，玩到哪开哪条
    if (tpl.kind === 'timeline') {
      const on = old.some(e => e.enabled !== false && isTimeline(e));
      prepared.entries.forEach((e, i) => {
        e.enabled = i === 0 && !on;
      });
    }
    prepared.entries.forEach(e => R.genIds.add(e.__miemieId));
    d.character_book.entries = [...old, ...prepared.entries];
  }
  const n = prepared.opening ? `${prepared.opening.length} 段开场` : `${prepared.entries.length} 条`;
  Object.assign(RG, { part: null, form: false, text: '', error: '' });
  repairRun();
  toast('装进去了：' + n);
}

/* ── 拿走 ── */
function renderRepairExport() {
  const card = R.fixed.card,
    d = card.data,
    cover = R.art || R.png;
  if (repairCoverURL) {
    URL.revokeObjectURL(repairCoverURL);
    repairCoverURL = null;
  }
  if (cover) repairCoverURL = URL.createObjectURL(new Blob([cover], { type: 'image/png' }));
  const lack = checkParts(card, []).filter(p => !p.ok).length,
    bad = repairFormatList().length;
  $('#repair-export').innerHTML =
    `<div class="export-preview">${repairCoverURL ? `<img class="card-cover" src="${repairCoverURL}" alt="角色卡封面">` : `<div class="card-cover cover-placeholder">${icon('sheep', 48)}<strong>${esc(d.name)}</strong><span class="small muted">默认封面</span></div>`}<div class="export-copy"><h2>${esc(d.name)}</h2><p>${repairEntries().length} 条世界书 · ${d.first_mes ? '1 个主开场' : '暂无开场'} · ${(d.alternate_greetings || []).length} 个备选开场<br>${esc(R.shape[0] || '')} → chara_card_v3</p>${lack || bad ? `<p class="notice">还缺 ${lack} 类件，${bad} 条正文不合模板。结构已经修好，可以先拿走用，也可以回第 04 步接着补。</p>` : '<p class="ok">结构修好了，件齐了，正文也合模板。</p>'}</div></div>`;
}

async function imageToPng(file) {
  if (file.size > 32 * 1024 * 1024) throw Error('立绘超过 32 MB，请先缩小图片。');
  const bmp = await createImageBitmap(file);
  if (bmp.width * bmp.height > 40000000) {
    bmp.close();
    throw Error('图片像素过大，请压缩后再试。');
  }
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  if (!blob) throw Error('图片转换失败');
  return new Uint8Array(await blob.arrayBuffer());
}

async function repairChooseArt(file) {
  if (!file || !R.fixed || !guardIdle()) return;
  repairBusy = true;
  renderBusy();
  try {
    R.art = await imageToPng(file);
  } finally {
    repairBusy = false;
    renderBusy();
  }
  renderRepairExport();
  toast('立绘已替换');
}

async function repairExportCard(kind) {
  if (!R.fixed || !guardIdle()) return;
  repairBusy = true;
  renderBusy();
  try {
    const card = cleanForExport(R.fixed.card),
      name = safeName(card.data.name);
    if (kind === 'json') download(JSON.stringify(card, null, 2), name + '.json', 'application/json');
    else if (kind === 'book')
      download(JSON.stringify(exportWorldbook(R.fixed.card), null, 2), name + '-世界书.json', 'application/json');
    else {
      const png = embedIntoPng(await pngBase(R.fixed.card, R.art, R.png, repairWork()), JSON.stringify(card));
      const readback = JSON.parse((await extractFromPng(png)).text);
      if (JSON.stringify(readback) !== JSON.stringify(card)) throw Error('PNG 回读校验失败，未下载。');
      download(png, name + '.png', 'image/png');
    }
    toast('已生成下载文件');
  } finally {
    repairBusy = false;
    renderBusy();
  }
}

/** 修好的卡送进出卡流水线：先把流水线手上的工程存档，再换成这张。 */
async function repairToPipeline() {
  if (!R.fixed || !guardIdle()) return;
  let moved = false;
  projectBusy = true;
  renderBusy();
  try {
    if (S.card && !(await saveProject('修卡台送卡之前'))) {
      toast('流水线当前的工程没存上，先不换卡。', 'error');
      return;
    }
    const os = R.raw.data.character_book.entries.map(e => Number(e.insertion_order)).filter(Number.isFinite);
    Object.assign(S, {
      card: structuredClone(R.fixed.card),
      filename: R.filename,
      png: R.png,
      art: R.art,
      shape: ['修卡台送来', ...R.shape],
      jobs: null,
      overrides: new Map(),
      lastAssembly: { count: R.fixed.count, acts: R.fixed.acts || [], at: Date.now() },
      initialOrders: os.length ? `${Math.max(...os)} → ${Math.min(...os)}` : null,
      lore: { work: repairWork(), text: R.lore.text || '', web: !!R.lore.web },
      roster: '',
      manual: { tplId: uiCfg.tplId, name: '', material: '', text: '', reasoning: '', appliedIds: [], params: {} },
    });
    onCardChanged();
    syncProjectInputs();
    await saveProject();
    moved = true;
  } finally {
    projectBusy = false;
    renderBusy();
  }
  if (moved) {
    goStep(2);
    toast('送进出卡流水线了。流水线原来的工程已存档，可以从存档点找回。');
  }
}

function renderRepairBusy() {
  const locked = busy(),
    has = !!R.fixed;
  $('#repair-choose').disabled = locked;
  $('#repair-drop').classList.toggle('locked', locked);
  for (const id of [
    'repair-choose-art',
    'repair-clear-art',
    'repair-png',
    'repair-json',
    'repair-book',
    'repair-to-pipeline',
  ])
    $('#' + id).disabled = locked || !has;
  $('#repair-lore').readOnly = locked;
  $('#repair-lore-web').disabled = locked;
  $$(
    '#repair [data-repair-gen], #repair [data-repair-opt], #repair [data-repair-seg], #repair-recast-start, #repair-recast-apply, #rg-go, #rg-apply',
  ).forEach(el => {
    el.disabled = locked;
  });
}

function initRepair() {
  const root = $('#repair'),
    drop = $('#repair-drop');
  $('#repair-lore').value = R.lore.text || '';
  $('#repair-lore-web').checked = !!R.lore.web;
  $('#repair-lore-count').textContent = `${(R.lore.text || '').length.toLocaleString()} / 12,000`;
  let loreTimer = 0;
  const saveLore = () => {
    clearTimeout(loreTimer);
    loreTimer = setTimeout(() => writeLocal('miemie.repair.lore', R.lore), 500);
  };
  $('#repair-lore').addEventListener('input', () => {
    R.lore.text = $('#repair-lore').value;
    $('#repair-lore-count').textContent = `${R.lore.text.length.toLocaleString()} / 12,000`;
    saveLore();
  });
  $('#repair-lore-web').addEventListener('change', () => {
    R.lore.web = $('#repair-lore-web').checked;
    saveLore();
  });

  const pick = () => {
    if (!busy()) $('#repair-file').click();
  };
  drop.onclick = pick; // 里面的「选择文件」按钮也冒泡到这里，只开一次
  drop.onkeydown = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick();
    }
  };
  ['dragenter', 'dragover'].forEach(n =>
    drop.addEventListener(n, e => {
      e.preventDefault();
      drop.classList.add('drag');
    }),
  );
  ['dragleave', 'drop'].forEach(n =>
    drop.addEventListener(n, e => {
      e.preventDefault();
      drop.classList.remove('drag');
    }),
  );
  drop.addEventListener(
    'drop',
    action(e => repairLoad(e.dataTransfer.files[0])),
  );
  $('#repair-file').onchange = action(async e => {
    await repairLoad(e.target.files[0]);
    e.target.value = '';
  });
  $('#repair-art').onchange = action(async e => {
    await repairChooseArt(e.target.files[0]);
    e.target.value = '';
  });

  root.addEventListener(
    'click',
    action(async ev => {
      const b = ev.target.closest('button');
      if (!b || b.disabled || b.closest('#repair-drop')) return;
      if (b.dataset.rstep) {
        goRepairStep(+b.dataset.rstep);
        return;
      }
      if (b.dataset.repairGen) {
        repairGenStart(b.dataset.repairGen);
        return;
      }
      if (b.dataset.repairView !== undefined) {
        repairView(b.dataset.repairView);
        return;
      }
      switch (b.id) {
        case 'repair-recast-start':
          await repairRecastAll();
          break;
        case 'repair-recast-stop':
          RC.abort = true;
          RC.controller?.abort();
          break;
        case 'repair-recast-apply':
          repairRecastApply();
          break;
        case 'repair-recast-drop':
          RC.results = [];
          renderRepairRecast();
          break;
        case 'rg-go':
          await repairGenRun();
          break;
        case 'rg-stop':
          RG.controller?.abort();
          break;
        case 'rg-apply':
          repairGenApply();
          break;
        case 'rg-retry':
          Object.assign(RG, { form: true, error: '' });
          renderRepairGen();
          break;
        case 'rg-cancel':
        case 'rg-drop':
          Object.assign(RG, { part: null, form: false, text: '', error: '' });
          renderRepairGen();
          break;
        case 'repair-png':
          await repairExportCard('png');
          break;
        case 'repair-json':
          await repairExportCard('json');
          break;
        case 'repair-book':
          await repairExportCard('book');
          break;
        case 'repair-choose-art':
          if (guardIdle()) $('#repair-art').click();
          break;
        case 'repair-clear-art':
          if (guardIdle()) {
            R.art = null;
            renderRepairExport();
          }
          break;
        case 'repair-to-pipeline':
          await repairToPipeline();
          break;
      }
    }),
  );
  root.addEventListener(
    'change',
    action(async ev => {
      const el = ev.target;
      if (el.dataset.repairOpt) {
        if (!guardIdle()) {
          renderRepairFixed();
          return;
        }
        R.opt[el.dataset.repairOpt] = el.checked;
        repairRun();
      } else if (el.dataset.repairSeg !== undefined) {
        if (!guardIdle()) {
          renderRepairFixed();
          return;
        }
        R.overrides.set(+el.dataset.repairSeg, el.value);
        repairRun();
      } else if (el.id === 'rg-tpl') RG.tplId = el.value;
      else if (el.id === 'rg-scope') {
        RG.params.whole = el.value === 'whole';
      } else if (el.dataset.rc !== undefined) {
        const b = RC.results.filter(x => x.newText)[+el.dataset.rc];
        if (b) b.pick = el.checked;
      }
    }),
  );
  root.addEventListener('input', ev => {
    const f = { 'rg-name': 'name', 'rg-material': 'material', 'rg-arc': 'arc', 'rg-start': 'start' }[ev.target.id];
    if (f) {
      RG.params[f] = ev.target.value;
      return;
    }
    if (ev.target.id !== 'rg-text') return;
    RG.text = ev.target.value;
    const q = checkText(RG.tplId, RG.text),
      line = $('#rg-qc');
    line.className = 'qc-line ' + (q.ok ? 'ok' : 'warn');
    line.textContent = q.ok ? '格式检查通过，可以装进卡里。' : q.issues.map(i => i.msg).join('；');
  });

  // 侧栏跟着滚动走：哪一步进了视口中段，就点亮哪一步
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      list => {
        for (const en of list) if (en.isIntersecting) setRailStep(+en.target.id.slice(5));
      },
      { rootMargin: '-35% 0px -55% 0px' },
    );
    for (let i = 1; i <= 5; i++) io.observe($('#rstep' + i));
  }
  window.addEventListener('pagehide', () => {
    RC.abort = true;
    RC.controller?.abort();
    RG.controller?.abort();
  });
  renderRepair();
}
