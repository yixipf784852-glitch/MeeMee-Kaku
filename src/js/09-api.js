/* ════════ 九、接口层 ════════ */
const PROVIDERS = [
  { name: '硅基流动', url: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3.2-Exp' },
  { name: 'DeepSeek', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '智谱GLM', url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4.7' },
  { name: 'Kimi', url: 'https://api.moonshot.cn/v1', model: 'kimi-k2-0905-preview' },
  { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat-v3.1' },
  { name: '自定义', url: '', model: '' },
];
const PROVIDERS_NOTE = '以下为旧版接口预填值，并非最新模型推荐；请以服务商控制台为准。';
const CORS_HINT =
  '这个接口不让网页直接带密钥。火山方舟（豆包）、部分云厂商都是这样，不是地址填错了。\n\n' +
  '解法：用工具同目录的 接口代理.py 在本机套一层——\n' +
  '  python 接口代理.py https://你填的那个地址\n' +
  '起好之后，把上面的「接口地址」改成 http://127.0.0.1:8799 就行。\n' +
  '（密钥只经过你自己的机器，不落盘、不外传。）';

function apiEndpoint(path = 'chat/completions') {
  const base = String(cfg.base || '').trim();
  if (!base) throw new Error('先填写接口地址。');
  let url;
  try {
    url = new URL(base);
  } catch (_) {
    throw new Error('接口地址需要是完整的 http:// 或 https:// 地址。');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('接口地址只支持 HTTP 或 HTTPS。');
  if (url.username || url.password) throw new Error('请把密钥填在密钥框中，不要放进接口地址。');
  const suffix = String(path).replace(/^\/+/, '').replace(/^v1\//, '');
  if (!['models', 'chat/completions'].includes(suffix)) throw new Error('不支持的接口路径。');
  let prefix = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
  const loopback = /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/i.test(url.hostname);
  if (!prefix && !loopback) prefix = '/v1';
  url.pathname = prefix + '/' + suffix;
  url.hash = '';
  return url.href;
}

function apiHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (String(cfg.key || '').trim()) headers.Authorization = 'Bearer ' + String(cfg.key).trim();
  return headers;
}

function apiErrorMessage(value) {
  if (typeof value === 'string') return value.slice(0, 600);
  if (value && typeof value.message === 'string') return value.message.slice(0, 600);
  try {
    return JSON.stringify(value).slice(0, 600);
  } catch (_) {
    return '未知接口错误';
  }
}

async function apiFetch(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === 'AbortError' || (options.signal && options.signal.aborted)) throw error;
    if (PLATFORM !== 'web')
      throw new Error('网络连接失败；请检查网络和接口地址。\n（原始错误：' + error.message + '）');
    throw new Error(
      '网络连接失败；请检查网络、地址及浏览器跨域限制。\n\n' + CORS_HINT + '\n（原始错误：' + error.message + '）',
    );
  }
  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let reason = raw;
    try {
      const obj = JSON.parse(raw);
      reason = obj.error || obj;
    } catch (_) {}
    throw new Error('接口返回 ' + response.status + '：' + apiErrorMessage(reason));
  }
  return response;
}

function apiTextPart(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value
      .map(part => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && part.text && typeof part.text.value === 'string') return part.text.value;
        return '';
      })
      .join('');
  return '';
}

// 仅由用户开始生成、重试或测试时调用。回调提供累计全文。
async function ask(sys, user, options = {}) {
  const { signal, onText, onReasoning, onUsage } = options;
  if (!String(cfg.model || '').trim()) throw new Error('先填写或读取模型名称。');
  const streaming = options.stream === undefined ? cfg.stream !== false : !!options.stream;
  const requestedMax = Number(options.maxTokens === undefined ? cfg.maxTokens : options.maxTokens);
  const requestedTemp = Number(options.temp === undefined ? cfg.temp : options.temp);
  const body = {
    model: String(cfg.model).trim(),
    messages: [
      { role: 'system', content: String(sys || '') },
      { role: 'user', content: String(user || '') },
    ],
    temperature: Number.isFinite(requestedTemp) ? Math.max(0, Math.min(2, requestedTemp)) : 0.8,
    max_tokens: Number.isFinite(requestedMax) && requestedMax > 0 ? Math.floor(requestedMax) : 6000,
    stream: streaming,
  };
  const response = await apiFetch(apiEndpoint(), {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  let text = '',
    reasoning = '',
    usage = null;
  const acceptObject = (obj, isDelta) => {
    if (!obj || typeof obj !== 'object') throw new Error('接口返回格式不正确。');
    if (obj.error) throw new Error('模型返回错误：' + apiErrorMessage(obj.error));
    if (obj.usage) {
      usage = obj.usage;
      if (onUsage) onUsage(usage);
    }
    const choice = obj.choices && obj.choices[0];
    if (!choice) return;
    const message = isDelta ? choice.delta || choice.message || {} : choice.message || choice.delta || {};
    const content = apiTextPart(message.content !== undefined ? message.content : choice.text);
    const think = apiTextPart(message.reasoning_content !== undefined ? message.reasoning_content : message.reasoning);
    if (content) {
      text += content;
      if (onText) onText(text);
    }
    if (think) {
      reasoning += think;
      if (onReasoning) onReasoning(reasoning);
    }
  };
  const acceptJSON = raw => {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (_) {
      throw new Error('接口返回的 JSON 无法解析，请检查接口是否兼容 OpenAI。');
    }
    acceptObject(obj, false);
  };
  // SSE 解析器：边收边解析（有 body 流时）和整段解析（安卓原生网络层一次给回整段时）共用
  let buffer = '',
    eventData = [],
    eventName = '',
    done = false;
  const dispatch = () => {
    if (!eventData.length) {
      eventName = '';
      return;
    }
    const data = eventData.join('\n');
    eventData = [];
    const name = eventName;
    eventName = '';
    if (data.trim() === '[DONE]') {
      done = true;
      return;
    }
    let obj;
    try {
      obj = JSON.parse(data);
    } catch (_) {
      throw new Error('流式响应包含无法解析的数据，已停止本件生成。');
    }
    if (name === 'error') throw new Error('模型返回错误：' + apiErrorMessage(obj.error || obj));
    acceptObject(obj, true);
  };
  const line = value => {
    if (value === '') {
      dispatch();
      return;
    }
    if (value.startsWith(':')) return;
    if (value.startsWith('data:')) eventData.push(value.slice(5).replace(/^ /, ''));
    else if (value.startsWith('event:')) eventName = value.slice(6).trim();
  };
  const parseLines = final => {
    while (!done) {
      const index = buffer.search(/[\r\n]/);
      if (index < 0 || (!final && buffer[index] === '\r' && index === buffer.length - 1)) break;
      const width = buffer[index] === '\r' && buffer[index + 1] === '\n' ? 2 : 1;
      const value = buffer.slice(0, index);
      buffer = buffer.slice(index + width);
      line(value);
    }
    if (final && !done) {
      if (buffer) line(buffer);
      buffer = '';
      dispatch();
    }
  };
  const contentType = response.headers.get('content-type') || '';
  if (/application\/(?:[\w.+-]*\+)?json/i.test(contentType)) {
    acceptJSON(await response.text());
  } else if (!response.body || !response.body.getReader) {
    // 安卓端请求走原生网络层（CapacitorHttp），流式回复也是整段一次给回来：看开头判断是 JSON 还是 SSE
    const raw = await response.text();
    if (/^[{\[]/.test(raw.trimStart())) acceptJSON(raw);
    else {
      buffer = raw;
      parseLines(true);
    }
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '',
      mode = '';
    try {
      while (!done) {
        const chunk = await reader.read();
        const decoded = chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
        if (!mode) {
          pending += decoded;
          const first = pending.trimStart();
          if (first) {
            mode = /^[{\[]/.test(first) ? 'json' : 'sse';
            buffer = pending;
            pending = '';
          }
        } else buffer += decoded;
        if (mode === 'sse') parseLines(chunk.done);
        if (chunk.done) break;
      }
      if (mode === 'json') acceptJSON(buffer);
    } finally {
      try {
        await reader.cancel();
      } catch (_) {}
      reader.releaseLock();
    }
  }
  if (!text.trim()) throw new Error(reasoning.trim() ? '模型只返回了思考过程，没有成品正文。' : '接口没有返回正文。');
  return { text, reasoning, usage };
}

async function fetchModels(options = {}) {
  const response = await apiFetch(apiEndpoint('models'), {
    method: 'GET',
    headers: apiHeaders(),
    signal: options.signal,
  });
  let obj;
  try {
    obj = await response.json();
  } catch (_) {
    throw new Error('模型列表不是有效 JSON。');
  }
  if (obj.error) throw new Error('读取模型失败：' + apiErrorMessage(obj.error));
  const list = Array.isArray(obj.data) ? obj.data : Array.isArray(obj.models) ? obj.models : null;
  if (!list) throw new Error('接口未返回 data 或 models 模型列表。');
  return [
    ...new Set(list.map(item => (typeof item === 'string' ? item : item.id || item.name)).filter(Boolean)),
  ].sort();
}

async function testApi(options = {}) {
  return ask('Reply with OK only.', 'OK', { ...options, stream: false, maxTokens: 16, temp: 0 });
}
