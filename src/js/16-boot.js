/* ════════ 十六、启动 ════════ */
function action(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      console.error('[咩咩制卡台]', e.name);
      toast(e.message || '操作失败', 'error');
    }
  };
}
async function init() {
  projectBusy = true;
  try {
    renderBusy();
    setTheme();
    hydrateIcons();
    syncApiStatus();
    $('#cors-hint').textContent = CORS_HINT;
    if (PLATFORM !== 'web') $('#cors-hint').closest('details').hidden = true;
    $('#providers').innerHTML = PROVIDERS.map(
      (p, i) => `<button class="btn btn-sm" data-provider="${i}">${esc(p.name)}</button>`,
    ).join('');
    document.addEventListener(
      'click',
      action(async event => {
        const b = event.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.tab) showTab(b.dataset.tab);
        if (b.dataset.step) goStep(+b.dataset.step);
        if (b.dataset.go) goStep(+b.dataset.go);
        if (b.hasAttribute('data-close')) b.closest('dialog').close();
        if (b.dataset.entry) {
          if (!guardIdle()) return;
          entryMode = b.dataset.entry;
          $$('[data-entry]').forEach(el => el.classList.toggle('active', el === b));
          $('#import-zone').hidden = entryMode === 'new';
          $('#new-form').hidden = entryMode !== 'new';
          $('#drop-title').textContent = entryMode === 'book' ? '把世界书放在这里' : '把角色卡放在这里';
          $('#drop-help').textContent =
            entryMode === 'book'
              ? '支持酒馆原生世界书 JSON，会建立一个新的卡工程。'
              : '支持 PNG 角色卡与 JSON 文件，正文原样保留。';
          $('#import-file').accept = entryMode === 'book' ? '.json' : '.png,.json,.txt';
        }
        if (b.dataset.generateKind) openPreview(b.dataset.generateKind);
        if (b.dataset.continueTimeline !== undefined) await continueTimeline();
        if (b.dataset.viewJob) inspectJob(b.dataset.viewJob);
        if (b.dataset.retryJob) {
          if (guardIdle()) {
            goStep(3);
            await retryJob(b.dataset.retryJob);
          }
        }
        if (b.dataset.viewEntry !== undefined) inspectEntry(+b.dataset.viewEntry);
        if (b.dataset.entryAdv !== undefined) {
          const id = cardEntries()[+b.dataset.entryAdv]?.__miemieId;
          if (id) {
            advOpen.has(id) ? advOpen.delete(id) : advOpen.add(id);
            renderEntries();
          }
        }
        if (b.dataset.entryDel !== undefined) {
          if (guardIdle()) deleteEntry(+b.dataset.entryDel);
        }
        if (b.dataset.entryMove !== undefined) {
          if (guardIdle()) moveEntry(+b.dataset.i, +b.dataset.entryMove);
        }
        if (b.dataset.template) await selectTemplate(b.dataset.template);
        if (b.dataset.history) await viewHistory(b.dataset.history);
        if (b.dataset.historyDel) {
          if (await deleteHistoryMany([b.dataset.historyDel])) toast('这条历史删了');
        }
        if (b.id === 'history-dedupe') {
          const d = historyDupes(await listHistory());
          if (await deleteHistoryMany(d.map(h => h.id))) toast(`去掉了 ${d.length} 条重复，每样留最新一条`);
        }
        if (b.id === 'history-clear' && confirm('清空全部生成历史？删了就找不回来了。')) {
          if (await clearHistory()) toast('生成历史清空了');
        }
        if (b.dataset.restore) await restoreSnapshot(b.dataset.restore);
        if (b.dataset.provider !== undefined) {
          const p = PROVIDERS[+b.dataset.provider];
          $('#api-base').value = p.url || p.base || '';
          $('#api-model').value = p.model || '';
          $('#api-feedback').textContent = '已填入旧版工具的接口预设；可读取模型列表选择实际可用模型。';
        }
      }),
    );
    document.addEventListener(
      'change',
      action(async event => {
        const el = event.target;
        if (el.dataset.previewIndex !== undefined) {
          previewJobs[+el.dataset.previewIndex].selected = el.checked;
          updatePreviewTotal();
        }
        if (el.dataset.opt) {
          if (!guardIdle()) {
            renderAssembly();
            return;
          }
          S.opt[el.dataset.opt] = el.checked;
          if (el.dataset.opt === 'constant')
            cardEntries().forEach(e => {
              if (e.__miemieManual) delete e.__miemieManual.constant;
            });
          if (el.dataset.opt === 'enable')
            cardEntries().forEach(e => {
              if (e.__miemieManual) delete e.__miemieManual.enabled;
            });
          if (el.dataset.opt === 'position')
            cardEntries().forEach(e => {
              if (e.__miemieManual) {
                delete e.__miemieManual.position;
                delete e.__miemieManual.depth;
              }
            });
          persistSoon();
        }
        if (el.dataset.entrySeg !== undefined) {
          if (!guardIdle()) {
            renderEntries();
            return;
          }
          S.overrides.set(+el.dataset.entrySeg, el.value);
          onCardChanged();
          persistSoon();
        }
        if (el.dataset.adv) {
          if (!guardIdle()) {
            renderEntries();
            return;
          }
          applyAdv(el);
        }
        for (const [attr, key] of [
          ['entryEnabled', 'enabled'],
          ['entryConstant', 'constant'],
        ])
          if (el.dataset[attr] !== undefined) {
            if (!guardIdle()) {
              renderEntries();
              return;
            }
            const e = cardEntries()[+el.dataset[attr]];
            e[key] = el.checked;
            e.__miemieManual = { ...(e.__miemieManual || {}), [key]: el.checked };
            onCardChanged();
            persistSoon();
          }
      }),
    );
    ['work-name', 'card-name', 'lore-text', 'roster', 'timeline-arc', 'timeline-start', 'hero-name'].forEach(id =>
      $('#' + id).addEventListener('input', () => {
        if (!busy()) readProjectInputs();
      }),
    );
    ['lore-web', 'char-template', 'timeline-template', 'timeline-scope', 'setting-mode', 'user-role'].forEach(id =>
      $('#' + id).addEventListener('change', () => {
        if (!busy()) readProjectInputs();
      }),
    );
    $('#create-card').onclick = action(createProject);
    $('#new-project').onclick = action(newBlankProject);
    $('#choose-file').onclick = e => {
      e.stopPropagation();
      $('#import-file').click();
    };
    $('#dropzone').onclick = () => $('#import-file').click();
    $('#dropzone').onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        $('#import-file').click();
      }
    };
    $('#import-file').onchange = action(async e => {
      await load(e.target.files[0]);
      e.target.value = '';
    });
    const drop = $('#dropzone');
    ['dragenter', 'dragover'].forEach(name =>
      drop.addEventListener(name, e => {
        e.preventDefault();
        drop.classList.add('drag');
      }),
    );
    ['dragleave', 'drop'].forEach(name =>
      drop.addEventListener(name, e => {
        e.preventDefault();
        drop.classList.remove('drag');
      }),
    );
    drop.addEventListener(
      'drop',
      action(e => load(e.dataTransfer.files[0])),
    );
    $('#preview-all').onclick = () => openPreview();
    $('#queue-preview').onclick = () => openPreview();
    $('#queue-start').onclick = action(beginPreview);
    $('#queue-stop').onclick = () => stopQueue();
    $('#queue-resume').onclick = action(async () => {
      if (guardIdle()) await startQueue();
    });
    $('#assemble').onclick = action(() => {
      if (guardIdle()) {
        run();
        toast('结构已整理，已有正文保持原样。');
      }
    });
    $('#entry-filter').oninput = renderEntries;
    $('#save-snapshot').onclick = action(async () => {
      if (guardIdle() && (await saveProject('手动存档'))) toast('存档点已保存');
    });
    $('#show-snapshots').onclick = action(showSnapshots);
    $('#restore-open').onclick = action(showSnapshots);
    $('#start-restore').onclick = action(showSnapshots);
    $('#add-manual').onclick = () => {
      if (guardIdle()) showTab('parts');
    };
    $('#inspect-save').onclick = action(saveInspected);
    $('#inspect-regenerate').onclick = regenerateInspected;
    $('#inspect-copy').onclick = () => copyText($('#inspect-text').value);
    $('#export-png').onclick = action(() => exportCard('png'));
    $('#export-json').onclick = action(() => exportCard('json'));
    $('#export-book').onclick = action(() => exportCard('book'));
    $('#choose-art').onclick = () => {
      if (guardIdle()) $('#art-file').click();
    };
    $('#art-file').onchange = action(async e => {
      await chooseArt(e.target.files[0]);
      e.target.value = '';
    });
    $('#clear-art').onclick = action(async () => {
      if (!guardIdle()) return;
      S.art = null;
      S.png = null;
      await saveProject();
      renderExport();
    });
    $('#open-api').onclick = () => {
      openApi();
      renderBusy();
    };
    $('#api-temp').oninput = () => ($('#api-temp-value').textContent = $('#api-temp').value);
    $('#save-api').onclick = action(() => {
      readApiInputs();
      if (writeLocal('miemie.cfg', cfg)) {
        syncApiStatus();
        $('#api-modal').close();
        toast('接口配置已保存到本机');
      }
    });
    $('#fetch-models').onclick = action(async () => {
      readApiInputs();
      $('#fetch-models').disabled = true;
      $('#api-feedback').textContent = '正在读取模型…';
      try {
        const models = await fetchModels();
        $('#model-list').innerHTML = models.map(m => `<option value="${esc(m)}"></option>`).join('');
        $('#api-feedback').textContent = `读取到 ${models.length} 个模型，点击模型输入框选择。`;
      } catch (e) {
        $('#api-feedback').textContent = e.message;
      } finally {
        $('#fetch-models').disabled = false;
      }
    });
    $('#test-api').onclick = action(async () => {
      readApiInputs();
      $('#test-api').disabled = true;
      $('#api-feedback').textContent = '正在发起一次短测试请求…';
      try {
        await testApi();
        $('#api-feedback').textContent = '接口已返回响应，可以保存设置并开始生成。';
      } catch (e) {
        $('#api-feedback').textContent = e.message;
      } finally {
        $('#test-api').disabled = false;
      }
    });
    $('#theme-toggle').onclick = () => {
      const dark =
        uiCfg.theme === 'dark' || (uiCfg.theme === 'system' && matchMedia('(prefers-color-scheme:dark)').matches);
      uiCfg.theme = dark ? 'light' : 'dark';
      writeLocal('miemie.ui', uiCfg);
      setTheme();
    };
    $('#manual-generate').onclick = action(generateManual);
    $('#manual-stop').onclick = () => manualController?.abort();
    $('#manual-apply').onclick = action(applyManual);
    $('#manual-output').oninput = () => {
      readManualInputs();
      renderManualQC();
      persistSoon();
    };
    [
      'manual-name',
      'manual-material',
      'manual-arc',
      'manual-start',
      'manual-scope',
      'manual-continue',
      'manual-setting-mode',
    ].forEach(
      id =>
        ($('#' + id).oninput = () => {
          readManualInputs();
          if (id === 'manual-scope' || id === 'manual-continue') renderContinue();
          persistSoon();
        }),
    );
    $('#copy-output').onclick = () => copyText($('#manual-output').value);
    $('#copy-prompt').onclick = action(async () => {
      const p = buildJobPrompt(manualJob());
      await copyText(p.sys + '\n\n' + p.user);
    });
    initRepair();
    if (matchMedia('(max-width:760px)').matches) $('#history-details').open = false;
    await restoreProject();
    syncProjectInputs();
    renderTemplates();
    syncManualInputs();
    onCardChanged();
    renderQueue();
    await renderHistory();
    if (S.card) goStep(2);
    else goStep(1);
    window.addEventListener('pagehide', () => {
      stopQueue();
      manualController?.abort();
      void saveProject();
    });
  } finally {
    projectBusy = false;
    renderBusy();
  }
}
void init().catch(e => {
  console.error('[咩咩制卡台] 启动失败', e.name);
  toast('启动失败：' + e.message, 'error');
});
