/* ════════ 十一、一键出卡队列 ════════ */

let miemieQueuePromise = null;
let miemieQueueSequence = 0;
const miemieControllers = new Map();

function miemieId(prefix) {
  const random =
    globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  return prefix + '-' + random;
}

function parseRoster(text) {
  const found = new Map();
  String(text || '')
    .split(/\r?\n/)
    .forEach(line => {
      const cells = line.split('|');
      const name = (cells.shift() || '').trim();
      if (!name) return;
      const material = cells.join('|').trim();
      if (found.has(name)) {
        const row = found.get(name);
        if (material && !row.material.split('\n').includes(material))
          row.material += (row.material ? '\n' : '') + material;
      } else found.set(name, { name, material });
    });
  return [...found.values()];
}

function miemieTemplates() {
  return Array.isArray(TEMPLATES)
    ? TEMPLATES
    : Object.entries(TEMPLATES).map(([id, value]) => ({ ...value, id: value.id || id }));
}

function miemieTemplate(id) {
  return miemieTemplates().find(tpl => tpl.id === id);
}

function miemieHasCharacter(name) {
  const normalized = value =>
    String(value || '')
      .replace(/\s+/g, '')
      .toLocaleLowerCase();
  const target = normalized(name);
  const entries = (S.card && S.card.data && S.card.data.character_book && S.card.data.character_book.entries) || [];
  return entries.some(entry => {
    const content = String(entry.content || '');
    const keys = Array.isArray(entry.keys) ? entry.keys : [];
    const isCharacter = /<[^<>/]+character\s*>|^\s*名字\s*[:：]/m.test(content);
    if (!isCharacter) return false;
    if (keys.some(key => normalized(key) === target)) return true;
    const attr = content.match(/^\s*名字\s*[:：]\s*([^\r\n]+)/m);
    if (attr && normalized(attr[1]) === target) return true;
    const tag = content.match(/<([^<>/]+?)\s*character\s*>/);
    return !!tag && normalized(tag[1]) === target;
  });
}

function createJobs({ onlyKind, all = false } = {}) {
  if (!S.card) return [];
  const templates = miemieTemplates();
  const requested = onlyKind ? (miemieTemplate(onlyKind) || {}).kind || onlyKind : null;
  const canonical = kind => (/^(character|char|chara)$/.test(kind) ? 'chara' : kind);
  const wants = kind => !requested || canonical(requested) === canonical(kind);
  const roster = parseRoster(S.roster);
  const parts = checkParts(S.card, roster) || [];
  const partRows = Array.isArray(parts) ? parts : Object.values(parts);
  const characterPart = partRows.find(row => canonical(row.id || row.kind) === 'chara');
  const missingCharacters = Array.isArray(characterPart && characterPart.missingNames)
    ? new Set(characterPart.missingNames)
    : null;
  const params = S.params || {};
  const make = (tpl, name, material, extra = {}) => ({
    id: miemieId('job'),
    tplId: tpl.id,
    kind: canonical(tpl.kind),
    seg: tpl.seg,
    wave: Number(tpl.wave) || 1,
    name: name || tpl.name,
    material: material || '',
    params: structuredClone({ ...params, ...extra }),
    status: 'queued',
    text: '',
    reasoning: '',
    issues: [],
    appliedIds: [],
    attempts: 0,
    selected: true,
  });
  const result = [];
  if (wants('chara')) {
    const tpl = miemieTemplate(params.charTpl || 'charV2') || templates.find(item => canonical(item.kind) === 'chara');
    if (tpl)
      roster.forEach(row => {
        if (all || (missingCharacters ? missingCharacters.has(row.name) : !miemieHasCharacter(row.name)))
          result.push(make(tpl, row.name, row.material, { characterName: row.name, name: row.name }));
      });
  }
  ['setting', 'place', 'worldrule', 'timeline', 'status', 'topics', 'opening'].forEach(kind => {
    if (!wants(kind)) return;
    const part = partRows.find(row => canonical(row.id || row.kind) === kind);
    if (!all && part && part.ok) return;
    const tpl =
      kind === 'timeline'
        ? miemieTemplate(params.timelineTpl || 'tlTVD') || templates.find(item => item.kind === kind)
        : templates.find(item => item.kind === kind);
    if (tpl) result.push(make(tpl));
  });
  return result.sort((a, b) => a.wave - b.wave);
}

function estimateJobs(jobs) {
  return Math.ceil(
    (jobs || [])
      .filter(job => job.selected !== false && job.status !== 'success')
      .reduce((sum, job) => {
        const tpl = miemieTemplate(job.tplId) || {};
        const prompt = buildJobPrompt(job);
        // buildJobPrompt 已含模板、共同规则和真正送出的资料，避免将模板重复计数。
        return (
          sum +
          (String(prompt.sys || '').length + String(prompt.user || '').length + (Number(tpl.expectedChars) || 4000)) *
            0.7
        );
      }, 0),
  );
}

function miemieQueueRender() {
  if (typeof renderQueue === 'function') renderQueue();
  if (typeof renderLive === 'function') renderLive();
}

function miemieUsage(value) {
  if (typeof value === 'number') return { prompt_tokens: 0, completion_tokens: value, total_tokens: value };
  const input = Number(value && (value.prompt_tokens ?? value.input_tokens)) || 0;
  const output = Number(value && (value.completion_tokens ?? value.output_tokens)) || 0;
  const total = Number(value && value.total_tokens) || input + output;
  return { prompt_tokens: input, completion_tokens: output, total_tokens: total };
}

function miemieAddUsage(target, previous, next) {
  ['prompt_tokens', 'completion_tokens', 'total_tokens'].forEach(key => {
    target[key] = (Number(target[key]) || 0) + (Number(next[key]) || 0) - (Number(previous[key]) || 0);
  });
}

async function miemieRunJob(job, queue, sequence) {
  const current = () => S.jobs === queue && sequence === miemieQueueSequence && !queue.stopped;
  for (let attempt = 0; attempt < 2 && current(); attempt++) {
    const retryIssues = (job.issues || []).map(issue => issue.msg || issue.t || String(issue)).filter(Boolean);
    const controller = new AbortController();
    miemieControllers.set(job.id, controller);
    job.status = 'running';
    job.text = '';
    job.reasoning = '';
    job.error = '';
    job.attempts = (Number(job.attempts) || 0) + 1;
    job.startedAt = Date.now();
    job.usage = miemieUsage(job.usage);
    let attemptUsage = miemieUsage(null);
    const onUsage = value => {
      if (!current() || controller.signal.aborted || !value) return;
      const next = miemieUsage(value);
      miemieAddUsage(queue.usage, attemptUsage, next);
      miemieAddUsage(job.usage, attemptUsage, next);
      attemptUsage = next;
      miemieQueueRender();
    };
    miemieQueueRender();
    try {
      // 每次请求才构建 prompt，后一波才能拿到已回填的条目摘要。
      const prompt = buildJobPrompt(job);
      if (attempt > 0 && retryIssues.length) {
        prompt.user +=
          '\n\n【上次格式自检未通过】\n' +
          retryIssues.map(message => '- ' + message).join('\n') +
          '\n请补齐上述要求，重新输出完整成品。';
      }
      const response = await ask(prompt.sys, prompt.user, {
        signal: controller.signal,
        onText: text => {
          if (current() && !controller.signal.aborted) {
            job.text = String(text || '');
            miemieQueueRender();
          }
        },
        onReasoning: text => {
          if (current() && !controller.signal.aborted) {
            job.reasoning = String(text || '');
            miemieQueueRender();
          }
        },
        onUsage,
      });
      if (!current() || controller.signal.aborted) {
        job.status = 'queued';
        return;
      }
      job.text = typeof response === 'string' ? response : String((response && response.text) || job.text || '');
      if (response && typeof response === 'object') {
        job.reasoning = String(response.reasoning || job.reasoning || '');
        onUsage(response.usage);
      }
      const check = checkText(job.tplId, job.text);
      job.issues = check.issues || [];
      job.warnings = check.warnings || [];
      if (!check.ok) {
        if (!job.issues.length) job.issues = [{ lv: 'warn', msg: '输出未通过格式自检，请检查成品。' }];
        if (attempt === 0) {
          miemieQueueRender();
          continue;
        }
        job.status = 'warning';
        job.completedAt = Date.now();
        await saveProject();
        return;
      }
      // applyGen 在 CHECK 通过后才替换此任务的 appliedIds，失败不得先删除旧件。
      applyGen(job, job.text);
      job.status = 'success';
      job.completedAt = Date.now();
      onCardChanged();
      await saveProject();
      await addHistory(job);
      return;
    } catch (error) {
      if (controller.signal.aborted || !current() || (error && error.name === 'AbortError')) {
        job.status = 'queued';
      } else {
        job.status = 'error';
        job.error = (error && error.message) || String(error);
        job.issues = [{ lv: 'crit', msg: job.error }];
        job.completedAt = Date.now();
        await saveProject();
      }
      return;
    } finally {
      if (miemieControllers.get(job.id) === controller) miemieControllers.delete(job.id);
      miemieQueueRender();
    }
  }
}

function startQueue(jobs, options = {}) {
  if (miemieQueuePromise || (S.jobs && S.jobs.running)) {
    toast('已有队列在运行，请先停下。', 'warn');
    return Promise.resolve(false);
  }
  if (!S.card) {
    toast('先新建或导入一张卡。', 'warn');
    return Promise.resolve(false);
  }
  if (Array.isArray(jobs)) {
    S.jobs = {
      items: jobs,
      running: false,
      stopped: false,
      usage: miemieUsage(null),
      createdAt: Date.now(),
      runCount: 0,
    };
  }
  const queue = S.jobs;
  const ids = options.onlyIds ? new Set(options.onlyIds) : null;
  const pending =
    queue && Array.isArray(queue.items)
      ? queue.items.filter(job => job.selected !== false && job.status === 'queued' && (!ids || ids.has(job.id)))
      : [];
  if (!pending.length) {
    toast('没有排队中的任务。可重生成单件或回到盘点继续补件。', 'info');
    return Promise.resolve(false);
  }
  queue.running = true;
  queue.stopped = false;
  queue.usage = miemieUsage(queue.usage);
  queue.runCount = (Number(queue.runCount) || 0) + 1;
  queue.startedAt = Date.now();
  queue.activeIds = pending.map(job => job.id);
  const sequence = ++miemieQueueSequence;
  const concurrency = Math.max(1, Math.min(5, Math.floor(Number(uiCfg.concurrency) || 3)));
  miemieQueueRender();
  const execute = async () => {
    try {
      await saveProject('一键出卡前');
      const waves = [...new Set(pending.map(job => Number(job.wave) || 1))].sort((a, b) => a - b);
      for (const wave of waves) {
        if (queue.stopped || S.jobs !== queue || sequence !== miemieQueueSequence) break;
        const batch = pending.filter(job => (Number(job.wave) || 1) === wave);
        let cursor = 0;
        const worker = async () => {
          while (!queue.stopped && S.jobs === queue && sequence === miemieQueueSequence && cursor < batch.length) {
            const job = batch[cursor++];
            if (job.status === 'queued') await miemieRunJob(job, queue, sequence);
          }
        };
        await Promise.all(Array.from({ length: Math.min(concurrency, batch.length) }, worker));
      }
      if (!queue.stopped && S.jobs === queue && sequence === miemieQueueSequence) {
        queue.completedAt = Date.now();
        const successful = pending.filter(job => job.status === 'success').length;
        const attention = pending.filter(job => job.status === 'warning' || job.status === 'error').length;
        queue.summary = {
          success: successful,
          attention,
          pending: pending.filter(job => job.status === 'queued').length,
        };
        toast(`${successful} 件成功 · ${attention} 件需要检查`, attention ? 'warn' : 'success');
        run();
        goStep(5);
      }
      return !queue.stopped;
    } catch (error) {
      toast('队列中断：' + ((error && error.message) || error), 'error');
      queue.stopped = true;
      for (const controller of miemieControllers.values()) controller.abort();
      return false;
    } finally {
      queue.running = false;
      queue.activeIds = [];
      queue.items.forEach(job => {
        if (job.status === 'running') job.status = 'queued';
      });
      await saveProject(queue.stopped ? '一键出卡暂停' : '一键出卡后');
      miemieQueuePromise = null;
      miemieQueueRender();
    }
  };
  miemieQueuePromise = execute();
  return miemieQueuePromise;
}

function stopQueue() {
  if (!S.jobs || !S.jobs.running) return false;
  S.jobs.stopped = true;
  for (const controller of miemieControllers.values()) controller.abort();
  S.jobs.items.forEach(job => {
    if (job.status === 'running') job.status = 'queued';
  });
  miemieQueueRender();
  void saveProject();
  toast('已停止请求。完成的零件已保留，可接着跑剩余任务。', 'info');
  return true;
}

function retryJob(id) {
  if (miemieQueuePromise || (S.jobs && S.jobs.running)) {
    toast('队列运行中，请先停下再重生成。', 'warn');
    return Promise.resolve(false);
  }
  const job = S.jobs && S.jobs.items && S.jobs.items.find(item => item.id === id);
  if (!job) return Promise.resolve(false);
  job.status = 'queued';
  job.selected = true;
  job.error = '';
  job.issues = [];
  // appliedIds 保留，只有新结果通过自检后 applyGen 才替换原产物。
  return startQueue(undefined, { onlyIds: [id] });
}
