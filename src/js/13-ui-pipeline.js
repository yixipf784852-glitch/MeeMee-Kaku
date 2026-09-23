/* ════════ 十三、界面 · 流水线 ════════ */
function setTheme() {
  if (uiCfg.theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = uiCfg.theme;
  window.miemieDesktop?.setTheme(uiCfg.theme);
  $('#theme-toggle').title =
    `当前：${uiCfg.theme === 'dark' ? '夜班' : uiCfg.theme === 'light' ? '暖纸' : '跟随系统'}；点击切换`;
}
function showTab(tab) {
  currentTab = tab;
  $('#pipeline').hidden = tab !== 'pipeline';
  $('#parts').hidden = tab !== 'parts';
  $('#repair').hidden = tab !== 'repair';
  $$('[data-tab]').forEach(el => el.setAttribute('aria-selected', String(el.dataset.tab === tab)));
  if (tab === 'parts') {
    if (matchMedia('(max-width:760px)').matches) $('#history-details').open = false;
    renderTemplates();
    syncManualInputs();
    void renderHistory();
  } else if (tab === 'repair') renderRepair();
  else renderLive();
}
function goStep(n) {
  if (n > 1 && !S.card) {
    toast('先建立或导入一个工程');
    return;
  }
  currentStep = n;
  showTab('pipeline');
  for (let i = 1; i <= 5; i++) $('#step' + i).hidden = i !== n;
  $$('[data-step]').forEach(el => {
    if (+el.dataset.step === n) el.setAttribute('aria-current', 'step');
    else el.removeAttribute('aria-current');
  });
  if (n === 1) syncProjectInputs();
  if (n === 2) renderHealth();
  if (n === 3) renderQueue();
  if (n === 4) renderAssembly();
  if (n === 5) renderExport();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
function readProjectInputs() {
  S.lore = {
    work: $('#work-name').value.trim(),
    text: $('#lore-text').value.slice(0, 12000),
    web: $('#lore-web').checked,
  };
  S.roster = $('#roster').value;
  S.params = {
    charTpl: $('#char-template').value,
    timelineTpl: $('#timeline-template').value,
    arc: $('#timeline-arc').value.trim(),
    start: $('#timeline-start').value.trim(),
    whole: $('#timeline-scope').value === 'whole',
    settingOne: $('#setting-mode').value === 'one',
  };
  $('#lore-count').textContent = `${S.lore.text.length.toLocaleString()} / 12,000`;
  if (S.card) {
    const name = $('#card-name').value.trim();
    if (name) {
      S.card.data.name = name;
      S.filename = name;
    }
    onCardChanged();
    persistSoon();
  }
}
function syncProjectInputs() {
  S.lore ||= { work: '', text: '', web: false };
  S.params ||= { charTpl: 'charV2', timelineTpl: 'tlTVD', arc: '', start: '' };
  $('#work-name').value = S.lore.work || '';
  $('#card-name').value = S.card?.data.name || '';
  $('#lore-text').value = S.lore.text || '';
  $('#lore-web').checked = !!S.lore.web;
  $('#roster').value = S.roster || '';
  $('#char-template').value = S.params.charTpl || 'charV2';
  $('#timeline-template').value = S.params.timelineTpl || 'tlTVD';
  $('#timeline-arc').value = S.params.arc || '';
  $('#timeline-start').value = S.params.start || '';
  $('#timeline-scope').value = S.params.whole ? 'whole' : 'arc';
  $('#setting-mode').value = S.params.settingOne ? 'one' : 'split';
  $('#lore-count').textContent = `${(S.lore.text || '').length.toLocaleString()} / 12,000`;
  $('#create-card').innerHTML = (S.card ? '更新资料，重新盘点' : '建立工程，开始盘点') + ' ' + icon('arrow');
}
function cardEntries() {
  return S.card?.data.character_book?.entries || [];
}
function ensureIds() {
  cardEntries().forEach(e => {
    if (!e.__miemieId) e.__miemieId = crypto.randomUUID();
  });
}
function onCardChanged() {
  renderBusy();
  if (S.card) {
    ensureIds();
    S.plan = buildPlan(cardEntries(), S.overrides);
    S.issues = diagnose(S.card, S.plan);
    S.parts = checkParts(S.card, parseRoster(S.roster));
  } else {
    S.plan = new Map();
    S.issues = [];
    S.parts = [];
  }
  $$('[data-step]').forEach(el => (el.disabled = +el.dataset.step > 1 && !S.card));
  renderLive();
  // 零件台「接在哪条后面」列的是卡里的时间线，卡一变就跟着刷新
  if (S.manual) renderContinue();
  if (currentStep === 2) renderHealth();
  if (currentStep === 4) renderAssembly();
  if (currentStep === 5) renderExport();
  $('#manual-target').textContent = S.card
    ? `装入目标：${S.card.data.name}。新零件会加入当前卡，重生成只替换本件产物。`
    : '当前没有卡工程。装入时会按零件名称建立一个工程。';
}
function run() {
  if (!S.card) return;
  ensureIds();
  const old = cardEntries();
  const overrideById = new Map([...S.overrides].map(([i, seg]) => [old[i]?.__miemieId, seg]));
  const result = assembleCard(S.card, S.overrides, S.opt);
  S.card = result.card;
  cardEntries().forEach(e => {
    const m = e.__miemieManual;
    if (m) {
      if (typeof m.enabled === 'boolean') e.enabled = m.enabled;
      if (typeof m.constant === 'boolean') e.constant = m.constant;
      if (typeof m.position === 'number') {
        e.extensions.position = m.position;
        e.position = m.position === 0 ? 'before_char' : 'after_char';
      }
      if (typeof m.depth === 'number') e.extensions.depth = m.depth;
    }
  });
  S.overrides = new Map();
  cardEntries().forEach((e, i) => {
    if (overrideById.has(e.__miemieId)) S.overrides.set(i, overrideById.get(e.__miemieId));
  });
  S.lastAssembly = { count: result.count, acts: result.acts || [], at: Date.now() };
  onCardChanged();
  void saveProject();
  return result;
}
function faultMarkup(issue) {
  return `<div class="fault"><div class="mark ${esc(issue.lv)}"><span class="dot"></span>${{ crit: '重', warn: '轻', info: '惯例', ok: '好' }[issue.lv] || '提示'}</div><div class="body"><div class="t">${esc(issue.t)}</div><div class="p">${esc(issue.p)}</div>${issue.tech ? `<details class="tech"><summary>技术细节</summary><p>${esc(issue.tech)}</p></details>` : ''}</div>${issue.n ? `<div class="cnt">${esc(issue.n)}</div>` : ''}</div>`;
}
function renderHealth() {
  if (!S.card) return;
  const issues = S.issues.filter(i => i.kind !== 'style' && i.lv !== 'ok');
  const style = S.issues.filter(i => i.kind === 'style');
  const missing = S.parts.filter(p => !p.ok);
  $('#health-summary').innerHTML =
    `<span class="pill">${icon('book', 13)} ${esc(S.card.data.name)}</span><span class="mono muted">${cardEntries().length} 条目</span><span class="${issues.length ? 'warn' : 'ok'}">${issues.length ? issues.length + ' 处需要处理' : '结构体检未发现问题'}</span>`;
  $('#fault-list').innerHTML = issues.length
    ? issues.map(faultMarkup).join('')
    : `<div class="fault"><div class="mark ok">${icon('check')}</div><div class="body"><div class="t">这一轮结构检查通过</div><div class="p">再确认下面的缺件和全卡正文格式。</div></div></div>`;
  $('#convention').hidden = !style.length;
  $('#convention-summary').textContent = `还有 ${style.length} 条「不合母版但不算坏」`;
  $('#convention-list').innerHTML = style.map(faultMarkup).join('');
  $('#parts-count').textContent = `${S.parts.length - missing.length} / ${S.parts.length} 类齐备`;
  $('#part-list').innerHTML = S.parts
    .map(
      p =>
        `<div class="part-row"><span class="${p.ok ? 'ok' : 'muted'}">${icon(p.ok ? 'check' : 'circle', 15)}</span><span title="${esc(p.want)}">${esc(p.name)}</span><span class="part-got">${esc(p.got)}</span>${p.ok ? (p.id === 'timeline' ? '<button class="btn btn-sm" data-continue-timeline>接着写</button>' : '<span class="muted small">已就位</span>') : `<button class="btn btn-sm" data-generate-kind="${esc(p.id)}">单独生成</button>`}</div>`,
    )
    .join('');
  $('#preview-label').textContent = missing.length ? `一键出卡 · 缺 ${missing.length} 类` : '预览下一轮零件';
  $('#preview-all').disabled = busy();
}
function distribution() {
  const counts = Object.fromEntries(SEGMENTS.map(s => [s.id, 0]));
  cardEntries().forEach((e, i) => {
    if (!MARKER_RE.test(e.comment || '')) counts[S.plan.get(i)?.seg || 'rule']++;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return {
    counts,
    total,
    band: `<div class="distribution" aria-label="分区分布">${SEGMENTS.filter(s => counts[s.id])
      .map(
        s =>
          `<span title="${esc(segLabel(s.id))} ${counts[s.id]} 条" style="width:${(counts[s.id] / Math.max(1, total)) * 100}%;background:var(--seg-${s.id})"></span>`,
      )
      .join('')}</div>`,
  };
}
function renderLive() {
  const rail = $('#live-rail');
  if (!rail) return;
  const dist = distribution();
  if (!S.card) {
    rail.innerHTML = `<div class="section-label">卡的实况</div><div class="empty-live-art">${icon('sheep', 90)}</div><h2 style="font-size:16px">等一张卡，慢慢成形。</h2><p class="live-sub">新建或导入后，条目、分区与缺件<br>会在这里实时更新。</p><div class="live-note">零件不是散落的文本。<br>每次生成都会回到同一个卡工程，<br>从这里，一步步装成成品。</div>`;
    $('#mobile-live-summary').innerHTML =
      `${icon('book', 14)} <strong>尚未建立工程</strong><span>数据仅留在本机</span>${icon('arrow', 13)}`;
    $('#mobile-live-content').textContent = '建立工程后，实时查看条目与分区分布。';
    return;
  }
  const es = cardEntries(),
    orders = es.map(e => +e.insertion_order).filter(Number.isFinite),
    range = orders.length ? `${Math.max(...orders)} → ${Math.min(...orders)}` : '—';
  const guessed = [...S.plan.values()].filter(p => p.guessedGender).length;
  const active = S.jobs?.items?.find(j => j.status === 'running');
  const missing = S.parts.filter(p => !p.ok).length;
  const header = `<div class="section-label">卡的实况</div><h2>${esc(S.card.data.name)}</h2><p class="live-sub">${esc(S.lore.work || '本机卡工程')}</p>`;
  const summary = `<div class="live-stats"><div class="stat"><span>世界书条目</span><strong>${es.length}<small> 条</small></strong></div><div class="stat"><span>还缺</span><strong>${missing}<small> 类零件</small></strong></div><div class="stat" style="grid-column:1/-1"><span>当前 order${S.initialOrders ? ' · 导入时 ' + esc(S.initialOrders) : ''}</span><strong style="font-size:23px">${range}</strong></div></div><div class="section-label">分区分布</div>${dist.band}<div class="legend">${SEGMENTS.map(s => `<div><i class="seg-dot" style="background:var(--seg-${s.id})"></i>${esc(segLabel(s.id).replace('清空局部变量', '清空变量'))}<span class="mono">${dist.counts[s.id]}</span></div>`).join('')}</div>${guessed ? `<div class="live-note warn">${guessed} 条角色的性别来自推测。请在装配表里确认分区。</div>` : ''}`;
  if (active) {
    const thinkingOpen = !!rail.querySelector('details[open]');
    rail.innerHTML =
      header +
      `<div class="section-title">正在写 <span class="small">${esc(active.name)}</span></div><div class="live-stream">${esc((active.text || '等待模型开始输出…').slice(-14000))}<span class="cursor"></span></div><details class="tech"><summary>思考过程</summary><div class="reasoning">${esc(active.reasoning || '暂无思考内容')}</div></details><div class="live-note mono">本轮用量：${esc(usageLabel(S.jobs.usage))}<br>已装入 ${es.length} 条 · 还缺 ${missing} 类</div>`;
    const stream = rail.querySelector('.live-stream');
    stream.scrollTop = stream.scrollHeight;
    if (thinkingOpen) rail.querySelector('details').open = true;
  } else
    rail.innerHTML =
      header +
      summary +
      `<div class="live-note">${S.lastAssembly ? '结构已整理，可以继续补件或导出。' : '装配只改分区与顺序，已有正文保持原样。'}<br><span id="live-save-status">自动存盘 · 本机 IndexedDB</span></div>`;
  $('#mobile-live-summary').innerHTML =
    `<strong>${esc(S.card.data.name)}</strong><span>${es.length} 条 / 缺 ${missing} 类</span>${dist.band}${icon('arrow', 13)}`;
  $('#mobile-live-content').innerHTML = active
    ? `<strong>${esc(active.name)} · 正在写</strong><div class="live-stream">${esc(active.text || '等待输出…')}</div>`
    : summary;
}
function usageLabel(usage) {
  if (!usage) return '接口未返回';
  if (typeof usage === 'number') return usage.toLocaleString() + ' token';
  const n = usage.total_tokens ?? usage.totalTokens ?? (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  return n ? Number(n).toLocaleString() + ' token' : '接口未返回';
}
function renderQueue() {
  renderBusy();
  if (!$('#queue-list')) return;
  const items = S.jobs?.items || [];
  const done = items.filter(j => j.status === 'success').length,
    attention = items.filter(j => ['warning', 'error'].includes(j.status)).length,
    running = !!S.jobs?.running;
  $('#queue-summary').innerHTML = items.length
    ? `<span class="ok">${done} 件成功</span><span class="${attention ? 'warn' : 'muted'}">${attention} 件需要看一眼</span><span class="muted">${running ? '正在生成' : S.jobs?.stopped ? '已暂停' : '本轮已保存'}</span>`
    : '<span class="muted">还没有生成任务。先预览缺件清单。</span>';
  $('#queue-progress-bar').style.width = (items.length ? ((done + attention) / items.length) * 100 : 0) + '%';
  const labels = ['', '第一波', '第二波', '第三波'],
    sub = ['', '角色、设定与地点', '时间线与状态栏', '话题池与开场白'];
  $('#queue-list').innerHTML =
    [1, 2, 3]
      .map(w => {
        const group = items.filter(j => j.wave === w);
        if (!group.length) return '';
        return `<div class="queue-wave"><div class="wave-title"><strong>${labels[w]}</strong><small>${sub[w]}</small><span class="serif">${group.filter(j => j.status === 'success').length} / ${group.length}</span></div>${group
          .map(j => {
            const status =
              { queued: 'circle', running: 'circle', success: 'check', warning: 'warning', error: 'close' }[j.status] ||
              'circle';
            const color = { success: 'ok', warning: 'warn', error: 'crit', running: '' }[j.status] || '';
            return `<div class="queue-row ${esc(j.status)}"><span class="${color}">${icon(status, 15)}</span><i class="seg-dot" style="background:var(--seg-${esc(j.seg || 'rule')})"></i><span>${esc(j.name)}</span><span class="mono count">${j.status === 'running' ? '正在写 ' : ''}${(j.text || '').length.toLocaleString()} 字</span><button class="icon-btn" data-view-job="${esc(j.id)}" aria-label="查看 ${esc(j.name)}" title="查看正文">${icon('list', 14)}</button><button class="icon-btn" data-retry-job="${esc(j.id)}" ${running ? 'disabled' : ''} aria-label="重生成 ${esc(j.name)}" title="重生成">${icon('refresh', 14)}</button></div>${['warning', 'error'].includes(j.status) ? `<div class="queue-error ${color}">${esc(j.error || j.issues?.map(i => (typeof i === 'string' ? i : i.msg)).join('；') || '请检查正文格式')}</div>` : ''}`;
          })
          .join('')}</div>`;
      })
      .join('') ||
    `<div class="empty-state">${icon('list', 32)}<h2>队列还空着</h2><p>每一件都会显示进度，成功后自动回填。</p></div>`;
  $('#queue-stop').hidden = !running;
  $('#queue-resume').hidden = running || !items.some(j => j.status === 'queued');
  $('#queue-preview').disabled = busy();
  renderLive();
}
const OPT_LABELS = [
  ['order', '按分区重排序号'],
  ['position', '整理注入位置'],
  ['keys', '补缺失的关键词'],
  ['constant', '整理常驻与触发'],
  ['enable', '时间线只开启一条'],
  ['marker', '补齐分区标记'],
  ['clear', '补清空变量条目'],
];
function renderAssembly() {
  if (!S.card) return;
  $('#assembly-switches').innerHTML = OPT_LABELS.map(
    ([key, label]) => `<label><input type="checkbox" data-opt="${key}" ${S.opt[key] ? 'checked' : ''}>${label}</label>`,
  ).join('');
  $('#assembly-summary').textContent = S.lastAssembly
    ? `上次装配：${S.lastAssembly.count} 条。${S.lastAssembly.acts.slice(0, 3).join('；') || '结构无需调整'}。`
    : '装配前可以逐条确认分区；开关只控制结构调整。';
  renderEntries();
  renderCardQC();
}
function renderCardQC() {
  const q = tieredChecks(S.card),
    keep = $('#card-qc details')?.open;
  const row = (c, soft) =>
    `<div class="audit-row${soft ? ' soft' : ''}"><button class="text-btn" data-view-entry="${c.index}">${esc(c.comment || '开场白')}</button><span>${esc(c.list.map(i => i.msg).join('；'))}</span></div>`;
  $('#card-qc').innerHTML =
    (q.play.length
      ? `<p class="qc-line warn">${icon('warning', 14)} ${q.play.length} 条要看一眼：日期写错、事件编号重复、标签没闭合这类，AI 读时间线或状态栏时可能犯迷糊。</p>${q.play.map(c => row(c)).join('')}`
      : `<p class="qc-line ok">${icon('check', 14)} 没有影响游玩的格式问题。内容准确性仍需人工确认。</p>`) +
    (q.style.length
      ? `<details class="details-box"${keep ? ' open' : ''}><summary>还有 ${q.style.length} 条只是不合咩咩模板，不影响导入和游玩</summary><p class="source-note">缺 ## 标题、缺模板标签、栏位名跟模板不一样这类。想统一成咩咩的写法，点条目名，送零件台重写那一件。</p>${q.style.map(c => row(c, true)).join('')}</details>`
      : '');
}
// 条目高级设置照搬旧工坊 v1.3：关键词每行一个、支持 /正则/；位置按酒馆 1.18 的实际含义标（旧版把 2、3 写成了「系统提示顶/底」）
const POS_OPTIONS = [
  [1, '↓角色定义后'],
  [0, '↑角色定义前'],
  [2, '↑作者注释前'],
  [3, '↓作者注释后'],
  [4, '@深度'],
  [5, '↑示例消息前'],
  [6, '↓示例消息后'],
  [7, 'Outlet'],
];
const advOpen = new Set();
function renderEntries() {
  if (!S.card) return;
  const act = document.activeElement,
    focus = act && act.dataset && act.dataset.adv ? `[data-adv="${act.dataset.adv}"][data-i="${act.dataset.i}"]` : null;
  const filter = $('#entry-filter').value.trim().toLocaleLowerCase(),
    es = cardEntries();
  $('#entry-count').textContent = es.length + ' 条';
  const rows = es
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !filter || ((e.comment || '') + ' ' + (e.content || '')).toLocaleLowerCase().includes(filter));
  $('#entry-table-container').innerHTML =
    `<table class="entry-table"><thead><tr><th>条目 / 正文</th><th>分区</th><th>order</th><th>启用</th><th>常驻</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>${
      rows
        .map(({ e, i }) => {
          const p = S.plan.get(i) || { seg: 'rule' },
            marker = MARKER_RE.test(e.comment || ''),
            open = !marker && advOpen.has(e.__miemieId);
          return (
            `<tr class="${marker ? 'marker' : ''}${open ? ' adv-open' : ''}"><td><div class="cell-title"><i class="seg-dot" style="background:var(--seg-${p.seg})"></i><button class="entry-name" data-view-entry="${i}" title="${esc(e.comment)}">${esc(e.comment || '未命名条目')}</button></div></td><td><select data-entry-seg="${i}" aria-label="${esc(e.comment)} 分区" ${marker ? 'disabled' : ''}>${SEGMENTS.map(s => `<option value="${s.id}" ${p.seg === s.id ? 'selected' : ''}>${esc(segLabel(s.id))}</option>`).join('')}</select></td><td class="mono">${esc(e.insertion_order ?? '—')}</td><td><input type="checkbox" data-entry-enabled="${i}" aria-label="启用 ${esc(e.comment)}" ${e.enabled !== false ? 'checked' : ''} ${marker ? 'disabled' : ''}></td><td><input type="checkbox" data-entry-constant="${i}" aria-label="常驻 ${esc(e.comment)}" ${e.constant ? 'checked' : ''} ${marker ? 'disabled' : ''}></td>` +
            `<td class="row-tools">${marker ? '' : `<button class="icon-btn" data-entry-adv="${i}" title="高级设置（关键词/顺序/位置/深度/概率）" aria-label="${esc(e.comment)} 高级设置" aria-expanded="${open}">${icon('settings', 14)}</button><button class="icon-btn" data-entry-del="${i}" title="删掉这条" aria-label="删掉 ${esc(e.comment)}">${icon('close', 14)}</button>`}</td></tr>${open ? advRow(e, i) : ''}`
          );
        })
        .join('') || '<tr><td colspan="6">没有匹配的条目</td></tr>'
    }</tbody></table>`;
  if (focus) $(focus)?.focus();
}
function advRow(e, i) {
  const x = e.extensions || {},
    pos = x.position ?? (e.position === 'before_char' ? 0 : 1);
  return (
    `<tr class="adv-row"><td colspan="6"><div class="adv-grid">` +
    `<label class="field"><span>条目名</span><input data-adv="comment" data-i="${i}" value="${esc(e.comment)}"></label>` +
    `<label class="field"><span>主要关键词 <small class="muted">每行一个，支持 /正则/</small></span><textarea data-adv="keys" data-i="${i}" rows="2" spellcheck="false">${esc((e.keys || []).join('\n'))}</textarea></label>` +
    `<label class="field"><span>次要关键词 <small class="muted">每行一个，可留空</small></span><textarea data-adv="secondary_keys" data-i="${i}" rows="2" spellcheck="false">${esc((e.secondary_keys || []).join('\n'))}</textarea></label>` +
    `</div><div class="adv-nums">` +
    `<label title="同一位置里的注入顺序">顺序<input type="number" data-adv="order" data-i="${i}" value="${esc(e.insertion_order ?? '')}"></label>` +
    `<label>位置<select data-adv="position" data-i="${i}">${POS_OPTIONS.map(([v, l]) => `<option value="${v}" ${v === pos ? 'selected' : ''}>${l}</option>`).join('')}</select></label>` +
    `<label title="位置选「@深度」时生效">深度<input type="number" min="0" data-adv="depth" data-i="${i}" value="${esc(x.depth ?? 4)}"></label>` +
    `<label>概率%<input type="number" min="0" max="100" data-adv="probability" data-i="${i}" value="${esc(x.probability ?? 100)}"></label>` +
    `<label class="check-label" title="条目内容不再触发其他条目（excludeRecursion + preventRecursion）"><input type="checkbox" data-adv="norecurse" data-i="${i}" ${x.exclude_recursion || x.prevent_recursion ? 'checked' : ''}>防递归</label>` +
    `<button class="btn btn-sm" data-entry-move="-1" data-i="${i}" title="在本分区里上移">↑ 上移</button><button class="btn btn-sm" data-entry-move="1" data-i="${i}" title="在本分区里下移">↓ 下移</button>` +
    `</div><p class="source-note">「按分区重排序号」开着时，导出会按分区重新编号，这里填的数字只管先后。正文不在这里改：点条目名查看，要重写就送零件台。</p></td></tr>`
  );
}
function markManual(e, key, value) {
  e.__miemieManual = { ...(e.__miemieManual || {}), [key]: value };
}
function applyAdv(el) {
  const e = cardEntries()[+el.dataset.i];
  if (!e) return;
  const x = e.extensions || (e.extensions = {}),
    v = el.value,
    lines = t =>
      t
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
  switch (el.dataset.adv) {
    case 'comment': {
      const old = e.comment || '',
        now = v.trim();
      if (!now) {
        el.value = old;
        return;
      }
      e.comment = now;
      if ((e.keys || []).length === 1 && e.keys[0] === old) e.keys = [now];
      break;
    }
    case 'keys':
      e.keys = lines(v);
      break;
    case 'secondary_keys':
      e.secondary_keys = lines(v);
      break;
    case 'order':
      if (v.trim() === '') return;
      e.insertion_order = Math.round(Number(v)) || 0;
      break;
    // 位置和深度记成手动设定：整理结构会按母版改回默认，run() 整理完再补回来
    case 'position': {
      const n = Number(v);
      x.position = n;
      e.position = n === 0 ? 'before_char' : 'after_char';
      markManual(e, 'position', n);
      break;
    }
    case 'depth':
      x.depth = Math.max(0, Math.round(Number(v)) || 0);
      markManual(e, 'depth', x.depth);
      break;
    case 'probability':
      x.probability = Math.min(100, Math.max(0, Math.round(Number(v)) || 0));
      x.useProbability = true;
      break;
    case 'norecurse':
      x.exclude_recursion = el.checked;
      x.prevent_recursion = el.checked;
      break;
    default:
      return;
  }
  onCardChanged();
  persistSoon();
}
// 分区覆盖按下标存；删、移之前先换成按条目 id，动完再换回来
function overridesById() {
  const es = cardEntries();
  return new Map([...S.overrides].map(([k, seg]) => [es[k]?.__miemieId, seg]).filter(([id]) => id));
}
function setOverridesById(map) {
  S.overrides = new Map();
  cardEntries().forEach((e, k) => {
    if (map.has(e.__miemieId)) S.overrides.set(k, map.get(e.__miemieId));
  });
}
function deleteEntry(i) {
  const card = S.card,
    es = cardEntries(),
    e = es[i];
  if (!e || MARKER_RE.test(e.comment || '')) return;
  const ids = overridesById(),
    seg = ids.get(e.__miemieId);
  es.splice(i, 1);
  ids.delete(e.__miemieId);
  setOverridesById(ids);
  advOpen.delete(e.__miemieId);
  onCardChanged();
  persistSoon();
  toastAction(`删了「${e.comment || '未命名条目'}」`, '撤销', () => {
    if (S.card !== card) {
      toast('工程已经换了，撤销不了。');
      return;
    }
    if (!guardIdle()) return;
    const now = overridesById(),
      list = cardEntries();
    list.splice(Math.min(i, list.length), 0, e);
    if (seg !== undefined) now.set(e.__miemieId, seg);
    setOverridesById(now);
    onCardChanged();
    persistSoon();
    toast('恢复了');
  });
}
function moveEntry(i, d) {
  const es = cardEntries(),
    seg = (S.plan.get(i) || {}).seg;
  let j = i + d;
  while (j >= 0 && j < es.length && ((S.plan.get(j) || {}).seg !== seg || MARKER_RE.test(es[j].comment || ''))) j += d;
  if (j < 0 || j >= es.length) {
    toast(d < 0 ? '已经是这个分区的第一条了。' : '已经是这个分区的最后一条了。');
    return;
  }
  // 序号和数组位置一起换：没整理过、序号全一样的卡也能挪
  const ids = overridesById(),
    a = es[i],
    b = es[j];
  [a.insertion_order, b.insertion_order] = [b.insertion_order, a.insertion_order];
  es[i] = b;
  es[j] = a;
  setOverridesById(ids);
  onCardChanged();
  persistSoon();
}
function toastAction(message, label, fn) {
  const t = $('#toast');
  t.className = 'toast';
  t.innerHTML = `${esc(message)}<button type="button" class="toast-act">${esc(label)}</button>`;
  t.hidden = false;
  t.querySelector('button').onclick = action(async () => {
    t.hidden = true;
    await fn();
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.hidden = true;
  }, 8000);
}
function renderExport() {
  if (!S.card) return;
  const outstanding = S.parts.filter(p => !p.ok).length,
    issues = tieredChecks(S.card).play.length;
  const cover = S.art || S.png;
  if (coverURL) {
    URL.revokeObjectURL(coverURL);
    coverURL = null;
  }
  if (cover) coverURL = URL.createObjectURL(new Blob([cover], { type: 'image/png' }));
  $('#export-content').innerHTML =
    `<div class="export-preview">${coverURL ? `<img class="card-cover" src="${coverURL}" alt="角色卡封面">` : `<div class="card-cover cover-placeholder">${icon('sheep', 48)}<strong>${esc(S.card.data.name)}</strong><span class="small muted">默认封面</span></div>`}<div class="export-copy"><h2>${esc(S.card.data.name)}</h2><p>${cardEntries().length} 条世界书 · ${S.card.data.first_mes ? '1 个主开场' : '暂无开场'}<br>${S.card.data.alternate_greetings?.length || 0} 个备选开场 · ccv3<br>${esc(S.lore.work || '本机卡工程')}</p>${outstanding || issues ? `<p class="notice">还缺 ${outstanding} 类零件，${issues} 条正文要看一眼。可以导出草稿，或返回继续补齐。</p>` : '<p class="ok">零件已齐，没有影响游玩的格式问题。</p>'}</div></div>`;
}
async function createProject() {
  if (!guardIdle()) return;
  readProjectInputs();
  if (!S.card) {
    const work = $('#work-name').value.trim(),
      name = $('#card-name').value.trim() || work;
    if (!name) {
      $('#work-name').focus();
      toast('先写一个作品名或卡名');
      return;
    }
    S.card = blankCard(work, name);
    S.filename = name;
    S.overrides = new Map();
    S.jobs = null;
    S.png = null;
    S.art = null;
    S.initialOrders = null;
  }
  onCardChanged();
  await saveProject();
  goStep(2);
}

async function newBlankProject() {
  if (!guardIdle()) return;
  projectBusy = true;
  renderBusy();
  try {
    if (S.card && !(await saveProject('另建空白卡前'))) return;
    S.card = null;
    S.filename = '卡';
    S.png = null;
    S.art = null;
    S.jobs = null;
    S.shape = [];
    S.overrides = new Map();
    S.lore = { work: '', text: '', web: false };
    S.roster = '';
    S.params = { charTpl: 'charV2', timelineTpl: 'tlTVD', arc: '', start: '' };
    S.lastAssembly = null;
    S.initialOrders = null;
    S.manual = { tplId: uiCfg.tplId, name: '', material: '', text: '', reasoning: '', appliedIds: [], params: {} };
    syncProjectInputs();
    onCardChanged();
    goStep(1);
    await saveProject();
    toast('原工程已存档，现在可以新建一张卡。');
  } finally {
    projectBusy = false;
    renderBusy();
  }
}

async function load(file) {
  if (!file || !guardIdle()) return;
  projectBusy = true;
  renderBusy();
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
    const normalized = normalize(looseParse(text));
    if (S.card && !(await saveProject('导入新工程之前'))) return;
    S.card = normalized.card;
    S.shape = [how, ...normalized.shape];
    S.filename = file.name.replace(/\.(png|json|txt)$/i, '');
    if (entryMode === 'book' && (!S.card.data.name || S.card.data.name === '未命名卡')) S.card.data.name = S.filename;
    S.png = png;
    S.art = null;
    S.jobs = null;
    S.overrides = new Map();
    S.lastAssembly = null;
    S.manual = { tplId: uiCfg.tplId, name: '', material: '', text: '', reasoning: '', appliedIds: [], params: {} };
    const os = cardEntries()
      .map(e => Number(e.insertion_order))
      .filter(Number.isFinite);
    S.initialOrders = os.length ? `${Math.max(...os)} → ${Math.min(...os)}` : null;
    S.lore = { work: '', text: '', web: false };
    S.roster = '';
    onCardChanged();
    syncProjectInputs();
    await saveProject();
    goStep(2);
    toast('已导入，正文保持原样');
  } finally {
    projectBusy = false;
    renderBusy();
  }
}
function openPreview(kind) {
  if (!S.card || !guardIdle()) return;
  previewJobs = createJobs(kind ? { onlyKind: kind } : {});
  if (!previewJobs.length) {
    toast(
      kind === 'chara'
        ? '先在第一步补充角色清单，已有角色不会重复生成。'
        : '本轮没有缺件。可在零件台追加内容，或在第一步添加新角色。',
    );
    if (kind === 'chara') goStep(1);
    return;
  }
  $('#preview-arc').value = S.params.arc || '';
  $('#preview-start').value = S.params.start || '';
  $('#queue-concurrency').value = String(uiCfg.concurrency || 3);
  $('#preview-api-hint').textContent =
    cfg.base && cfg.model
      ? '仅在点击开跑后请求所选接口；重试可能产生额外用量。'
      : '还未配置接口。可以先查看清单，再到顶栏配置接口。';
  $('#preview-jobs').innerHTML = previewJobs
    .map(
      (j, i) =>
        `<label class="preview-row"><input type="checkbox" data-preview-index="${i}" checked><i class="seg-dot" style="background:var(--seg-${esc(j.seg || 'rule')})"></i><span>${esc(j.name)}</span><small>第 ${j.wave} 波</small></label>`,
    )
    .join('');
  updatePreviewTotal();
  showDialog('#preview-modal');
}
function updatePreviewTotal() {
  const selected = previewJobs.filter(j => j.selected !== false);
  const token = estimateJobs(selected);
  $('#preview-total').innerHTML =
    `<div><strong>${selected.length}</strong>件零件</div><div><strong>${selected.length}</strong>次基础调用</div><div><strong>${token >= 10000 ? (token / 10000).toFixed(1) + ' 万' : token.toLocaleString()}</strong>token 粗估</div><div style="flex-basis:100%">按中文字符 × 0.7 粗估，含模板、资料与预计输出；非实际账单，不含自动重试。</div>`;
  $('#queue-start').disabled = !selected.length;
}
async function beginPreview() {
  if (!guardIdle()) return;
  if (!cfg.base || !cfg.model) {
    $('#preview-modal').close();
    openApi();
    toast('先填接口地址和模型，再开跑');
    return;
  }
  const jobs = previewJobs.filter(j => j.selected !== false);
  if (!jobs.length) return;
  S.params.arc = $('#preview-arc').value.trim();
  S.params.start = $('#preview-start').value.trim();
  uiCfg.concurrency = +$('#queue-concurrency').value;
  writeLocal('miemie.ui', uiCfg);
  jobs.forEach(j => (j.params = { ...j.params, arc: S.params.arc, start: S.params.start }));
  $('#preview-modal').close();
  goStep(3);
  await startQueue(jobs);
}
function inferTpl(entry) {
  if (entry?.__tplId) return entry.__tplId;
  const text = entry?.content || '',
    p = classify(entry || {});
  if (isTimeline(entry || {})) return S.params.timelineTpl || 'tlTVD';
  if (/status_format/.test(text)) return 'status';
  if (/<easter_eggs>/.test(text)) return 'topics';
  if (/<核心规则[:：]/.test(text)) return 'worldrule';
  if (p.seg === 'setting') return 'setting';
  if (p.seg === 'place') return 'place';
  if (['female', 'male', 'other'].includes(p.seg)) return 'charV2';
  return null;
}
function inspectJob(id) {
  const job = S.jobs?.items.find(j => j.id === id);
  if (!job) return;
  inspected = { type: 'job', job };
  $('#inspect-heading').textContent = job.name;
  $('#inspect-text').value = job.text || '';
  $('#inspect-text').readOnly = false;
  $('#inspect-note').textContent = '可以手工修正本次生成结果。自检通过后装入；重生成只替换这一件的产物。';
  $('#inspect-save').hidden = false;
  $('#inspect-save').textContent = '自检并装入';
  $('#inspect-regenerate').hidden = false;
  $('#inspect-reasoning-box').hidden = !job.reasoning;
  $('#inspect-reasoning').textContent = job.reasoning || '';
  $('#inspect-qc').textContent =
    job.error || job.issues?.map(i => (typeof i === 'string' ? i : i.msg)).join('；') || '';
  showDialog('#inspect-modal');
}
function inspectEntry(index) {
  const entry =
    index < 0
      ? {
          comment: index === -1 ? '主开场白' : '备选开场 ' + (-index - 1),
          content: index === -1 ? S.card.data.first_mes : S.card.data.alternate_greetings[-index - 2],
        }
      : cardEntries()[index];
  if (!entry) return;
  inspected = { type: 'entry', entry, index };
  $('#inspect-heading').textContent = entry.comment || '未命名条目';
  $('#inspect-text').value = entry.content || '';
  $('#inspect-text').readOnly = true;
  $('#inspect-note').textContent = '导入正文只读，装配不会改写。要重写这一件，可送往零件台，审阅新正文后明确替换。';
  $('#inspect-save').hidden = true;
  $('#inspect-regenerate').hidden = index < -1 || !(index < 0 || inferTpl(entry));
  $('#inspect-reasoning-box').hidden = true;
  $('#inspect-qc').textContent = '';
  showDialog('#inspect-modal');
}
async function saveInspected() {
  if (!guardIdle() || inspected?.type !== 'job') return;
  const job = inspected.job,
    text = $('#inspect-text').value;
  const qc = checkText(job.tplId, text);
  $('#inspect-qc').textContent = qc.issues.map(i => i.msg).join('；');
  if (!qc.ok) {
    toast('格式还没有通过，请按提示补齐。');
    return;
  }
  applyGen(job, text);
  job.text = text;
  job.status = 'success';
  job.issues = [];
  job.error = '';
  onCardChanged();
  await saveProject();
  await addHistory(job);
  renderQueue();
  $('#inspect-modal').close();
  toast('这一件已装入');
}
async function showSnapshots() {
  if (!guardIdle()) return;
  const snapshots = await listProjects();
  $('#snapshots-list').innerHTML = snapshots.length
    ? snapshots
        .map(
          p =>
            `<div class="snapshot-row"><div>${esc(p.label || p.name || '存档点')}<small>${esc(p.name || p.state?.card?.data?.name || '')} · ${new Date(p.createdAt || p.updatedAt).toLocaleString()}</small></div><button class="btn btn-sm" data-restore="${esc(p.id)}">恢复</button></div>`,
        )
        .join('')
    : '<p class="muted small">还没有存档点。装配页可「存个档」，队列前后也会自动保存。</p>';
  showDialog('#snapshots-modal');
}
async function restoreSnapshot(id) {
  if (!guardIdle()) return;
  projectBusy = true;
  renderBusy();
  try {
    if (!(await saveProject('回滚前自动保存'))) return;
    if (await restoreProject(id)) {
      $('#snapshots-modal').close();
      syncProjectInputs();
      onCardChanged();
      goStep(2);
      if (await saveProject()) toast('已恢复存档，生成队列保持暂停');
    }
  } finally {
    projectBusy = false;
    renderBusy();
  }
}
async function pngBase(card = S.card, art = S.art, png = S.png, work = S.lore && S.lore.work) {
  if (art) return new Uint8Array(art);
  if (png) return new Uint8Array(png);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const c = canvas.getContext('2d');
  c.fillStyle = '#231f1a';
  c.fillRect(0, 0, 512, 768);
  c.strokeStyle = '#5c4a28';
  c.lineWidth = 2;
  c.strokeRect(30, 30, 452, 708);
  c.fillStyle = '#d9a554';
  c.font = '70px Georgia';
  c.textAlign = 'center';
  c.fillText('咩', 256, 230);
  c.fillStyle = '#ece7dd';
  c.font = '28px "Microsoft YaHei", sans-serif';
  const name = String(card.data.name);
  const lines = [];
  let line = '';
  for (const ch of name) {
    if (c.measureText(line + ch).width > 390) {
      lines.push(line);
      line = '';
    }
    line += ch;
  }
  if (line) lines.push(line);
  lines.slice(0, 4).forEach((t, i) => c.fillText(t, 256, 335 + i * 46));
  c.fillStyle = '#a9a294';
  c.font = '16px "Microsoft YaHei", sans-serif';
  c.fillText(String(work || '咩咩制卡台').slice(0, 25), 256, 570);
  c.font = '13px "Microsoft YaHei", sans-serif';
  c.fillText('换张立绘再导一次', 256, 680);
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(Error('封面生成失败'))), 'image/png'),
  );
  return new Uint8Array(await blob.arrayBuffer());
}
async function chooseArt(file) {
  if (!file || !guardIdle()) return;
  projectBusy = true;
  renderBusy();
  try {
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
    S.art = new Uint8Array(await blob.arrayBuffer());
    await saveProject();
    renderExport();
    toast('立绘已替换');
  } finally {
    projectBusy = false;
    renderBusy();
  }
}
async function exportCard(kind) {
  if (!S.card || !guardIdle()) return;
  projectBusy = true;
  renderBusy();
  try {
    run();
    const card = cleanForExport(S.card);
    const name = safeName(card.data.name);
    if (kind === 'json') download(JSON.stringify(card, null, 2), name + '.json', 'application/json');
    else if (kind === 'book')
      download(JSON.stringify(exportWorldbook(S.card), null, 2), name + '-世界书.json', 'application/json');
    else {
      const png = embedIntoPng(await pngBase(), JSON.stringify(card));
      const readback = JSON.parse((await extractFromPng(png)).text);
      if (JSON.stringify(readback) !== JSON.stringify(card)) throw Error('PNG 回读校验失败，未下载。');
      download(png, name + '.png', 'image/png');
    }
    toast('已生成下载文件');
  } finally {
    projectBusy = false;
    renderBusy();
  }
}
function openApi() {
  $('#api-base').value = cfg.base || '';
  $('#api-key').value = cfg.key || '';
  $('#api-model').value = cfg.model || '';
  $('#api-temp').value = cfg.temp;
  $('#api-temp-value').textContent = cfg.temp;
  $('#api-max').value = cfg.maxTokens;
  $('#api-stream').checked = cfg.stream !== false;
  $('#api-feedback').textContent = '';
  showDialog('#api-modal');
}
function readApiInputs() {
  const base = $('#api-base').value.trim();
  if (base) {
    const url = new URL(base);
    if (!['https:', 'http:'].includes(url.protocol)) throw Error('接口地址必须使用 http 或 https。');
    if (url.username || url.password) throw Error('请把密钥填在密钥栏，不要写进接口地址。');
  }
  Object.assign(cfg, {
    base,
    key: $('#api-key').value.trim(),
    model: $('#api-model').value.trim(),
    temp: Number($('#api-temp').value),
    maxTokens: Math.max(256, Math.min(200000, Number($('#api-max').value) || 8192)),
    stream: $('#api-stream').checked,
  });
}
function syncApiStatus() {
  const ready = !!(cfg.base && cfg.model);
  $('#api-dot').classList.toggle('ready', ready);
  $('#api-state-label').textContent = ready ? cfg.model : '未配置接口';
  $('#api-state-label').title = ready ? '已填写配置，未代表接口已经测试通过' : '';
}
