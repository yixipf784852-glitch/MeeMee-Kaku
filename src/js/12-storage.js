/* ════════ 十二、持久化 ════════ */

let miemieDbPromise = null;
let miemieSaveTail = Promise.resolve();
let miemieLastStorageError = { text: '', at: 0 };

function miemieStorageError(action, error) {
  const text =
    action +
    '失败：' +
    ((error && error.message) || error || '浏览器未允许本地数据库') +
    '。当前内容仍在页面里，请及时导出。';
  const now = Date.now();
  if (miemieLastStorageError.text !== text || now - miemieLastStorageError.at > 5000) {
    toast(text, 'error');
    miemieLastStorageError = { text, at: now };
  }
  console.error('[咩咩本地存储]', action, error);
}

function openStore() {
  if (miemieDbPromise) return miemieDbPromise;
  miemieDbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }
    const request = indexedDB.open('miemie', 1);
    let settled = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      ['projects', 'history', 'lore'].forEach(name => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (settled) {
        db.close();
        return;
      }
      settled = true;
      db.onversionchange = () => {
        db.close();
        miemieDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      settled = true;
      reject(request.error || new Error('无法打开本地数据库'));
    };
    request.onblocked = () => {
      settled = true;
      reject(new Error('数据库被另一个旧窗口占用，请关闭旧窗口后重试'));
    };
  }).catch(error => {
    miemieDbPromise = null;
    throw error;
  });
  return miemieDbPromise;
}

async function miemieTransaction(names, mode, operation) {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error('数据库读写失败'));
    transaction.onabort = () => reject(transaction.error || new Error('数据库事务已取消'));
    try {
      const stores = Object.fromEntries(names.map(name => [name, transaction.objectStore(name)]));
      const returned = operation(stores);
      if (returned && typeof returned === 'object' && 'onsuccess' in returned) {
        returned.onsuccess = () => {
          result = returned.result;
        };
      } else result = returned;
    } catch (error) {
      transaction.abort();
      reject(error);
    }
  });
}

function miemieSavedJob(job, restoring = false) {
  const value = {};
  [
    'id',
    'tplId',
    'kind',
    'seg',
    'wave',
    'name',
    'material',
    'params',
    'status',
    'text',
    'reasoning',
    'issues',
    'warnings',
    'appliedIds',
    'appliedOpenings',
    'attempts',
    'selected',
    'error',
    'usage',
    'startedAt',
    'completedAt',
  ].forEach(key => {
    if (job[key] !== undefined) value[key] = structuredClone(job[key]);
  });
  if (restoring && value.status === 'running') value.status = 'queued';
  if (!['queued', 'running', 'success', 'warning', 'error'].includes(value.status)) value.status = 'queued';
  value.appliedIds = Array.isArray(value.appliedIds) ? value.appliedIds : [];
  value.appliedOpenings = Array.isArray(value.appliedOpenings) ? value.appliedOpenings : [];
  value.issues = Array.isArray(value.issues) ? value.issues : [];
  return value;
}

function miemieSavedQueue(queue, restoring = false) {
  if (!queue || !Array.isArray(queue.items)) return null;
  return {
    items: queue.items.map(job => miemieSavedJob(job, restoring)),
    running: restoring ? false : !!queue.running,
    stopped: restoring ? !!queue.stopped || !!queue.running : !!queue.stopped,
    usage: miemieUsage(queue.usage),
    createdAt: queue.createdAt || Date.now(),
    startedAt: queue.startedAt || null,
    completedAt: queue.completedAt || null,
    runCount: Number(queue.runCount) || 0,
    summary: structuredClone(queue.summary || null),
  };
}

function miemieProjectState() {
  // 显式列出工程字段；cfg、接口密钥、AbortController 和请求参数绝不进入快照。
  return structuredClone({
    card: S.card,
    filename: S.filename,
    png: S.png,
    art: S.art,
    shape: S.shape || [],
    overrides: [...(S.overrides || new Map())],
    opt: S.opt || {},
    jobs: miemieSavedQueue(S.jobs),
    lore: S.lore || {},
    roster: S.roster || '',
    params: S.params || {},
    manual: S.manual || {},
    initialOrders: S.initialOrders ?? null,
    lastAssembly: S.lastAssembly ?? null,
  });
}

function miemieNotifyProjectSaved(at, ok) {
  if (typeof onProjectSaved !== 'function') return;
  try {
    onProjectSaved(at, ok);
  } catch (error) {
    console.error('[咩咩存盘状态显示]', error);
  }
}

function saveProject(label) {
  const now = Date.now();
  let state;
  try {
    state = miemieProjectState();
  } catch (error) {
    miemieStorageError('保存工程', error);
    miemieNotifyProjectSaved(now, false);
    return Promise.resolve(false);
  }
  const name = (state.card && state.card.data && state.card.data.name) || state.filename || '未命名';
  const checkpoint = label
    ? { id: miemieId('project'), label: String(label), name, createdAt: now, updatedAt: now, state }
    : null;
  const current = { id: 'current', label: '自动存盘', name, createdAt: now, updatedAt: now, state };
  const write = async () => {
    try {
      await miemieTransaction(['projects', 'lore'], 'readwrite', stores => {
        stores.projects.put(current);
        if (checkpoint) stores.projects.put(checkpoint);
        stores.lore.put({ ...structuredClone(state.lore), id: name, name, updatedAt: now });
        return true;
      });
      miemieNotifyProjectSaved(now, true);
      return checkpoint ? checkpoint.id : 'current';
    } catch (error) {
      miemieStorageError('保存工程', error);
      miemieNotifyProjectSaved(now, false);
      return false;
    }
  };
  // 顺序写入调用时的快照，较早的自动保存不能在较新状态之后落盘。
  miemieSaveTail = miemieSaveTail.then(write, write);
  return miemieSaveTail;
}

async function restoreProject(id = 'current') {
  if (miemieQueuePromise || (S.jobs && S.jobs.running)) {
    toast('先停下队列，再恢复存档。', 'warn');
    return false;
  }
  try {
    await miemieSaveTail;
    const record = await miemieTransaction(['projects'], 'readonly', stores => stores.projects.get(id));
    if (!record) return false;
    const state = record.state;
    if (!state || typeof state !== 'object' || !Object.prototype.hasOwnProperty.call(state, 'card'))
      throw new Error('存档结构不完整');
    const restored = structuredClone(state);
    ['card', 'filename', 'png', 'art', 'shape', 'opt', 'lore', 'roster', 'params', 'manual'].forEach(key => {
      if (Object.prototype.hasOwnProperty.call(restored, key)) S[key] = restored[key];
    });
    // 旧存档缺少这些展示字段时清空，不能沿用另一个工程的装配结论。
    S.initialOrders = restored.initialOrders ?? null;
    S.lastAssembly = restored.lastAssembly ?? null;
    S.overrides = new Map(
      Array.isArray(restored.overrides)
        ? restored.overrides.filter(pair => Array.isArray(pair) && pair.length === 2)
        : [],
    );
    S.plan = new Map();
    S.issues = [];
    S.parts = [];
    S.jobs = miemieSavedQueue(restored.jobs, true);
    ++miemieQueueSequence;
    onCardChanged();
    miemieQueueRender();
    if (typeof renderHistory === 'function') await renderHistory();
    if (S.jobs && S.jobs.items.some(job => job.status === 'queued' && job.selected !== false))
      toast('工程已恢复。未完成的队列需手动点击「接着跑」。', 'info');
    return true;
  } catch (error) {
    miemieStorageError('恢复工程', error);
    return false;
  }
}

async function listProjects() {
  try {
    await miemieSaveTail;
    const records = await miemieTransaction(['projects'], 'readonly', stores => stores.projects.getAll());
    return (records || []).filter(record => record.id !== 'current').sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    miemieStorageError('读取存档', error);
    return [];
  }
}

async function addHistory(job) {
  const record = {
    id: miemieId('history'),
    createdAt: Date.now(),
    name: job.name || '',
    tplId: job.tplId,
    kind: job.kind,
    seg: job.seg,
    text: String(job.text || ''),
    reasoning: String(job.reasoning || ''),
    usage: miemieUsage(job.usage),
    params: structuredClone(job.params || {}),
    material: String(job.material || ''),
  };
  try {
    await miemieTransaction(['history'], 'readwrite', stores => {
      stores.history.put(record);
      return true;
    });
    if (typeof renderHistory === 'function') await renderHistory();
    return record.id;
  } catch (error) {
    miemieStorageError('保存生成历史', error);
    return false;
  }
}

async function listHistory() {
  try {
    const records = await miemieTransaction(['history'], 'readonly', stores => stores.history.getAll());
    return (records || []).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    miemieStorageError('读取生成历史', error);
    return [];
  }
}

async function deleteHistory(id) {
  try {
    await miemieTransaction(['history'], 'readwrite', stores => {
      stores.history.delete(id);
      return true;
    });
    if (typeof renderHistory === 'function') await renderHistory();
    return true;
  } catch (error) {
    miemieStorageError('删除生成历史', error);
    return false;
  }
}

async function clearHistory() {
  try {
    await miemieTransaction(['history'], 'readwrite', stores => {
      stores.history.clear();
      return true;
    });
    if (typeof renderHistory === 'function') await renderHistory();
    return true;
  } catch (error) {
    miemieStorageError('清空生成历史', error);
    return false;
  }
}
