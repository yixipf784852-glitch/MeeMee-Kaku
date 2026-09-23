/* ════════ 十四、界面 · 零件台 ════════ */
function renderTemplates() {
  let last = '';
  $('#template-list').innerHTML = TEMPLATES.map(t => {
    const title = t.cat !== last ? `<div class="template-group">${esc(t.cat)}</div>` : '';
    last = t.cat;
    return (
      title +
      `<button class="template-item ${S.manual.tplId === t.id ? 'active' : ''}" data-template="${t.id}">${esc(t.name)}<span class="mono">${t.kind === 'chara' ? 'CHAR' : t.kind === 'timeline' ? 'TIME' : ''}</span></button>`
    );
  }).join('');
  const t = TEMPLATES.find(t => t.id === S.manual.tplId) || TEMPLATES[1];
  $('#manual-title').textContent = t.name;
  $('#manual-desc').textContent = t.desc || '';
  $('#manual-name-label').textContent = t.kind === 'chara' ? '角色名称' : '作品 / 零件名称';
  $('#manual-timeline').hidden = t.kind !== 'timeline';
  $('#manual-setting').hidden = t.kind !== 'setting';
}
function timelineEntries() {
  ensureIds();
  return cardEntries().filter(e => /<world_timeline>[\s\S]*<\/world_timeline>/.test(e.content || ''));
}
// 「接着写」要选一条卡里现成的时间线；没有就只能先写一段
function renderContinue() {
  const list = timelineEntries(),
    scope = $('#manual-scope'),
    want = S.manual.params?.continueId;
  scope.querySelector('[value="continue"]').disabled = !list.length;
  if (scope.value === 'continue' && !list.length) scope.value = 'arc';
  const on = scope.value === 'continue';
  $('#manual-continue').innerHTML = list
    .map(e => {
      const tail = timelineTail(e.content);
      return `<option value="${esc(e.__miemieId)}">${esc(e.comment || '时间线')}${tail?.sandboxDate ? ' · 到 ' + esc(tail.sandboxDate) : ''}</option>`;
    })
    .join('');
  if (list.length)
    $('#manual-continue').value = list.some(e => e.__miemieId === want) ? want : list[list.length - 1].__miemieId;
  $('#manual-continue-field').hidden = !on;
  $('#manual-start-field').hidden = on;
  $('#manual-arc-label').textContent = on ? '这一段叫什么（可不填）' : '篇章';
  const tail = on && timelineTail(list.find(e => e.__miemieId === $('#manual-continue').value)?.content);
  $('#manual-continue-note').hidden = !on;
  $('#manual-continue-note').textContent = tail
    ? `专属资料贴下一段原文（比如第 201 章往后），整段发送。${tail.sandboxDate ? '日期从 ' + tail.sandboxDate + ' 之后排，' : ''}${tail.nextLetter ? '事件从 ' + tail.nextLetter + ' 往下编，' : ''}写完直接接进这条时间线。`
    : '';
}
function syncManualInputs() {
  S.manual ||= { tplId: uiCfg.tplId, name: '', material: '', text: '', reasoning: '', appliedIds: [], params: {} };
  $('#manual-name').value = S.manual.name || '';
  $('#manual-material').value = S.manual.material || '';
  $('#manual-output').value = S.manual.text || '';
  $('#manual-reasoning').textContent = S.manual.reasoning || '';
  $('#manual-reasoning-box').hidden = !S.manual.reasoning;
  $('#manual-arc').value = S.manual.params?.arc || S.params.arc || '';
  $('#manual-start').value = S.manual.params?.start || S.params.start || '';
  $('#manual-scope').value = S.manual.params?.continueId
    ? 'continue'
    : (S.manual.params?.whole ?? S.params.whole)
      ? 'whole'
      : 'arc';
  $('#manual-setting-mode').value = (S.manual.params?.settingOne ?? S.params.settingOne) ? 'one' : 'split';
  renderContinue();
  renderMaterialCount();
  renderManualQC();
}
function readManualInputs() {
  const scope = $('#manual-scope').value;
  Object.assign(S.manual, {
    name: $('#manual-name').value.trim(),
    material: $('#manual-material').value,
    text: $('#manual-output').value,
    params: {
      arc: $('#manual-arc').value.trim(),
      start: $('#manual-start').value.trim(),
      whole: scope === 'whole',
      settingOne: $('#manual-setting-mode').value === 'one',
      ...(scope === 'continue' && $('#manual-continue').value ? { continueId: $('#manual-continue').value } : {}),
    },
  });
  renderMaterialCount();
}
function renderMaterialCount() {
  const el = $('#manual-material-count');
  if (!el) return;
  const n = $('#manual-material').value.length,
    t = TEMPLATES.find(x => x.id === S.manual.tplId),
    whole = t?.kind === 'timeline' && $('#manual-scope').value !== 'arc';
  el.textContent = n ? `${n.toLocaleString()} 字${n > 12000 ? (whole ? ' · 全部发送' : ' · 只发前 12,000') : ''}` : '';
  el.className = 'mono small ' + (n > 12000 && !whole ? 'warn' : 'muted');
}
function manualJob() {
  readManualInputs();
  const t = TEMPLATES.find(t => t.id === S.manual.tplId);
  return {
    id: S.manual.id || crypto.randomUUID(),
    tplId: t.id,
    kind: t.kind,
    seg: t.seg,
    wave: t.wave,
    name: S.manual.name || S.lore.work || t.name,
    material: S.manual.material,
    params: S.manual.params,
    appliedIds: S.manual.appliedIds || [],
    appliedOpenings: S.manual.appliedOpenings || [],
    mergedBase: S.manual.mergedBase,
    text: S.manual.text,
    reasoning: S.manual.reasoning || '',
  };
}
function renderManualQC() {
  const text = $('#manual-output').value;
  $('#manual-count').textContent = text.length.toLocaleString() + ' 字';
  if (!text) {
    $('#manual-qc').className = 'qc-line muted';
    $('#manual-qc').textContent = '生成或粘贴正文后，格式自检会显示在这里。';
    return;
  }
  const q = checkText(S.manual.tplId, text);
  $('#manual-qc').className = 'qc-line ' + (q.ok ? 'ok' : 'warn');
  $('#manual-qc').textContent = q.ok ? '格式检查通过，可以装进当前卡。' : q.issues.map(i => i.msg).join('；');
}
async function selectTemplate(id) {
  if (!guardIdle()) return;
  await saveDraftIfNew();
  S.manual = { tplId: id, name: '', material: '', text: '', reasoning: '', appliedIds: [], params: {} };
  uiCfg.tplId = id;
  writeLocal('miemie.ui', uiCfg);
  renderTemplates();
  syncManualInputs();
  persistSoon();
}
async function generateManual() {
  if (!guardIdle()) return;
  if (!cfg.base || !cfg.model) {
    openApi();
    toast('先配置接口，或复制 Prompt 到其他聊天工具。');
    return;
  }
  const job = manualJob(),
    prompt = buildJobPrompt(job);
  manualController = new AbortController();
  manualRunning = true;
  renderBusy();
  $('#manual-generate').disabled = true;
  $('#manual-stop').hidden = false;
  $('#manual-apply').disabled = true;
  $('#manual-output').readOnly = true;
  $('#manual-name').disabled = true;
  $('#manual-material').disabled = true;
  S.manual.text = '';
  S.manual.reasoning = '';
  // 新写的一段是新零件：接时间线时要接在当前内容后面，不能退回上一次接之前
  delete S.manual.mergedBase;
  $('#manual-output').value = '';
  try {
    const result = await ask(prompt.sys, prompt.user, {
      signal: manualController.signal,
      onText: text => {
        S.manual.text = text;
        $('#manual-output').value = text;
        $('#manual-count').textContent = text.length.toLocaleString() + ' 字';
        $('#manual-output').scrollTop = $('#manual-output').scrollHeight;
      },
      onReasoning: text => {
        S.manual.reasoning = text;
        $('#manual-reasoning').textContent = text;
        $('#manual-reasoning-box').hidden = !text;
      },
    });
    Object.assign(S.manual, { text: result.text, reasoning: result.reasoning, id: job.id });
    $('#manual-output').value = result.text;
    await addHistory({ ...job, ...result, status: checkText(job.tplId, result.text).ok ? 'success' : 'warning' });
    toast('生成结束，请检查正文后装入。');
  } catch (e) {
    toast(e.name === 'AbortError' ? '已停止，当前草稿保留。' : e.message, e.name === 'AbortError' ? 'ok' : 'error');
  } finally {
    manualRunning = false;
    renderBusy();
    manualController = null;
    $('#manual-generate').disabled = false;
    $('#manual-stop').hidden = true;
    $('#manual-apply').disabled = false;
    $('#manual-output').readOnly = false;
    $('#manual-name').disabled = false;
    $('#manual-material').disabled = false;
    renderManualQC();
    persistSoon();
    void renderHistory();
  }
}
async function applyManual() {
  if (!guardIdle()) return;
  const job = manualJob();
  const q = checkText(job.tplId, job.text);
  renderManualQC();
  if (!q.ok) {
    toast('请先按自检提示补齐正文。');
    return;
  }
  if (!S.card) {
    S.card = blankCard(S.lore.work, job.name || '零件卡');
    S.filename = S.card.data.name;
  }
  if (!job.params?.continueId) {
    const prepared = prepareGenerated(job.tplId, job.text, job.name, job.params || {}),
      ids = new Set(cardEntries().map(e => e.__miemieId)),
      again = job.appliedIds.some(id => ids.has(id));
    if (prepared.entries.length > 1 || again) {
      const choice = await askApply(prepared.entries, again, job.seg);
      if (!choice) return;
      job.pick = choice.pick;
      if (!choice.replace) job.appliedIds = [];
    }
  }
  applyGen(job, job.text);
  S.manual.appliedIds = job.appliedIds;
  S.manual.mergedBase = job.mergedBase;
  S.manual.appliedOpenings = job.appliedOpenings || [];
  S.manual.id = job.id;
  onCardChanged();
  await saveProject();
  goStep(4);
  toast(job.params?.continueId ? '接好了，新的一段已经并进原来那条时间线' : '零件已装进当前卡');
}
// 写出好几条时挑着装；之前装过的，问一句是换掉还是另装一份
function askApply(entries, again, seg) {
  const d = $('#apply-modal'),
    many = entries.length > 1;
  $('#apply-pick').hidden = !many;
  $('#apply-mode').hidden = !again;
  $('#apply-list').innerHTML = many
    ? entries
        .map(
          (e, i) =>
            `<label class="preview-row"><input type="checkbox" data-apply-index="${i}" checked><i class="seg-dot" style="background:var(--seg-${esc(seg || 'rule')})"></i><span>${esc(e.comment)}</span><small>${e.content.length.toLocaleString()} 字</small></label>`,
        )
        .join('')
    : '';
  d.querySelector('[name="apply-mode"][value="replace"]').checked = true;
  return new Promise(resolve => {
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      $('#apply-confirm').onclick = null;
      d.removeEventListener('close', cancel);
      resolve(value);
    };
    const cancel = () => finish(null);
    $('#apply-confirm').onclick = () => {
      const pick = many
        ? [...d.querySelectorAll('[data-apply-index]')].filter(x => x.checked).map(x => +x.dataset.applyIndex)
        : [0];
      if (!pick.length) {
        toast('至少勾一条');
        return;
      }
      finish({ pick, replace: d.querySelector('[name="apply-mode"]:checked')?.value !== 'add' });
      d.close();
    };
    d.addEventListener('close', cancel);
    showDialog('#apply-modal');
  });
}
// 盘点里时间线已就位时的「接着写」：带着最后一条时间线去零件台
async function continueTimeline() {
  if (!guardIdle()) return;
  const last = timelineEntries().pop();
  if (!last) return;
  await selectTemplate(last.__tplId && /^tl/.test(last.__tplId) ? last.__tplId : S.params.timelineTpl || 'tlTVD');
  S.manual.params = { continueId: last.__miemieId };
  syncManualInputs();
  showTab('parts');
  $('#manual-material').focus();
}
// 载入历史、换模板前会把输出框存成草稿；正文已经在历史里就别再存，不然点一下多一条。
async function saveDraftIfNew() {
  readManualInputs();
  const t = (S.manual.text || '').trim();
  if (!t) return;
  const list = await listHistory();
  if (list.some(h => h.tplId === S.manual.tplId && String(h.text || '').trim() === t)) return;
  await addHistory({ ...manualJob(), status: 'draft' });
}
function historyDupes(list) {
  const seen = new Set();
  return list.filter(h => {
    const k = JSON.stringify([h.tplId, h.name || '', String(h.text || '').trim()]);
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  });
}
async function deleteHistoryMany(ids) {
  if (!ids.length) return true;
  try {
    await miemieTransaction(['history'], 'readwrite', stores => {
      ids.forEach(id => stores.history.delete(id));
      return true;
    });
    await renderHistory();
    return true;
  } catch (error) {
    miemieStorageError('删除生成历史', error);
    return false;
  }
}
async function renderHistory() {
  if (!$('#history-list')) return;
  historyCache = await listHistory();
  const dup = historyDupes(historyCache).length;
  const tools = historyCache.length
    ? `<div class="history-tools"><span class="small muted">${historyCache.length} 条${dup ? ` · 重复 ${dup} 条` : ''}</span>${dup ? '<button class="text-btn" id="history-dedupe">去掉重复</button>' : ''}<button class="text-btn" id="history-clear">清空</button></div>`
    : '';
  $('#history-list').innerHTML =
    tools +
    (historyCache
      .slice(0, 40)
      .map(
        h =>
          `<div class="history-item"><button class="history-row" data-history="${esc(h.id)}"><strong><i class="seg-dot" style="background:var(--seg-${esc(h.seg || 'rule')})"></i>${esc(h.name || h.tplId)}</strong><small>${new Date(h.createdAt).toLocaleDateString()} · ${(h.text || '').length.toLocaleString()} 字</small></button><button class="history-del" data-history-del="${esc(h.id)}" aria-label="删除这条：${esc(h.name || h.tplId)}" title="删除这条">${icon('close', 13)}</button></div>`,
      )
      .join('') || '<p class="source-note">写过的零件会留在这里。<br>当前暂无生成记录。</p>');
}
async function viewHistory(id) {
  if (!guardIdle()) return;
  const h = historyCache.find(x => x.id === id);
  if (!h) return;
  await saveDraftIfNew();
  S.manual = {
    tplId: h.tplId,
    name: h.name,
    material: h.material || '',
    text: h.text,
    reasoning: h.reasoning || '',
    appliedIds: [],
    params: h.params || {},
  };
  showTab('parts');
  toast('已载入历史副本；装入时会作为新零件。');
}
function regenerateInspected() {
  if (!guardIdle() || !inspected) return;
  let j;
  if (inspected.type === 'job') j = inspected.job;
  else {
    const e = inspected.entry,
      tplId = inspected.index < 0 ? 'opening' : inferTpl(e);
    j = {
      tplId,
      name: e.comment,
      material: e.content,
      text: '',
      appliedIds: inspected.index < 0 ? [] : [e.__miemieId],
      appliedOpenings: inspected.index < 0 ? [e.content] : [],
      params: {},
    };
  }
  S.manual = {
    tplId: j.tplId,
    name: j.name,
    material: j.material || j.text || '',
    text: '',
    reasoning: '',
    appliedIds: [...(j.appliedIds || [])],
    appliedOpenings: [...(j.appliedOpenings || [])],
    params: j.params || {},
  };
  $('#inspect-modal').close();
  showTab('parts');
  toast('已送到零件台；审阅并装入后才会替换原件。');
}
