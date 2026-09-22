/* ════════ 三、卡归一化 ════════ */

function looseParse(raw) {
  let text = String(raw)
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const variants = [text];
  const a = text.indexOf('{'),
    b = text.lastIndexOf('}');
  if (a >= 0 && b > a) variants.push(text.slice(a, b + 1));
  try {
    variants.push(b64ToText(text));
  } catch (_) {}
  let last;
  for (const value of variants) {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    } catch (e) {
      last = e;
    }
  }
  throw new Error('这个文件不是有效的 JSON：' + last?.message);
}
const NATIVE_EXT_MAP = {
  excludeRecursion: 'exclude_recursion',
  preventRecursion: 'prevent_recursion',
  displayIndex: 'display_index',
  groupOverride: 'group_override',
  groupWeight: 'group_weight',
  scanDepth: 'scan_depth',
  matchWholeWords: 'match_whole_words',
  caseSensitive: 'case_sensitive',
  useGroupScoring: 'use_group_scoring',
  automationId: 'automation_id',
  outletName: 'outlet_name',
  delayUntilRecursion: 'delay_until_recursion',
  matchPersonaDescription: 'match_persona_description',
  matchCharacterDescription: 'match_character_description',
  matchCharacterPersonality: 'match_character_personality',
  matchCharacterDepthPrompt: 'match_character_depth_prompt',
  matchScenario: 'match_scenario',
  matchCreatorNotes: 'match_creator_notes',
  ignoreBudget: 'ignore_budget',
};
const NATIVE_EXT_SAME = [
  'position',
  'depth',
  'probability',
  'useProbability',
  'selectiveLogic',
  'group',
  'role',
  'vectorized',
  'sticky',
  'cooldown',
  'delay',
  'triggers',
];
const INTERNAL_ENTRY_FIELDS = ['__new', '__seg', '__tplId', '__miemieId', '__miemieManual'];
const arrayField = v =>
  Array.isArray(v) ? structuredClone(v) : v === undefined || v === null || v === '' ? [] : [String(v)];
function normalizeEntry(value, index = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('世界书第 ' + (index + 1) + ' 条不是对象');
  const e = structuredClone(value),
    native = 'key' in e || 'keysecondary' in e || 'order' in e || 'disable' in e || 'uid' in e;
  const ext =
    e.extensions && typeof e.extensions === 'object' && !Array.isArray(e.extensions) ? { ...e.extensions } : {};
  for (const [camel, snake] of Object.entries(NATIVE_EXT_MAP)) {
    if (camel in ext) {
      if (!(snake in ext)) ext[snake] = ext[camel];
      delete ext[camel];
    }
    if (native && camel in e) ext[snake] = e[camel];
  }
  for (const key of NATIVE_EXT_SAME) if (native && key in e) ext[key] = e[key];
  const position = ext.position ?? e.position ?? 1;
  const positionNumber = typeof position === 'number' ? position : position === '@Depth' ? 4 : (POS_NUM[position] ?? 1);
  e.position = positionNumber === 0 ? 'before_char' : 'after_char';
  ext.position = positionNumber;
  e.id = e.id ?? e.uid ?? index + 1;
  e.keys = arrayField(e.keys ?? e.key);
  e.secondary_keys = arrayField(e.secondary_keys ?? e.keysecondary);
  e.comment = e.comment ?? '';
  e.content = e.content ?? '';
  if (typeof e.content !== 'string') throw new Error('世界书第 ' + (index + 1) + ' 条 content 不是文字，未做有损转换');
  e.constant = !!e.constant;
  e.selective = e.selective === undefined ? true : !!e.selective;
  e.insertion_order = e.insertion_order ?? e.order ?? 100;
  e.enabled = e.enabled === undefined ? !e.disable : !!e.enabled;
  e.use_regex = !!(e.use_regex ?? e.useRegex);
  e.extensions = ext;
  for (const key of [
    'key',
    'keysecondary',
    'order',
    'disable',
    'uid',
    'useRegex',
    ...Object.keys(NATIVE_EXT_MAP),
    ...NATIVE_EXT_SAME.filter(k => k !== 'position'),
  ])
    delete e[key];
  return e;
}
function nativeToCcv3(e) {
  return normalizeEntry(e);
}
function blankCard(work = '', name = '') {
  const card = {
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: {
      ...structuredClone(CARD_FIELDS),
      name: String(name || work || '未命名卡'),
      assets: [],
      nickname: '',
      source: [],
      group_only_greetings: [],
      creation_date: Math.floor(Date.now() / 1000),
      modification_date: Math.floor(Date.now() / 1000),
    },
  };
  card.data.character_book = { name: String(work || name || '未命名') + '世界书', entries: [] };
  return card;
}
function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('认不出这是什么：需要角色卡或世界书对象');
  const shape = [];
  let card;
  if (raw.entries && !raw.data && !raw.spec) {
    card = blankCard(raw.name || '', '未命名卡');
    card.data.character_book = structuredClone(raw);
    shape.push('已将独立世界书装入空白角色卡');
  } else if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)) {
    card = structuredClone(raw);
    shape.push(`${raw.spec || '没有 spec'} ${raw.spec_version || ''}`.trim());
  } else if ('name' in raw || 'description' in raw) {
    card = { spec: 'chara_card_v3', spec_version: '3.0', data: structuredClone(raw) };
    shape.push('已转换老式扁平角色卡');
  } else throw new Error('认不出这是什么：既没有 data 层，也没有 name 或 entries');
  const d = card.data;
  for (const [k, v] of Object.entries(CARD_FIELDS))
    if (d[k] === undefined) d[k] = raw[k] !== undefined ? structuredClone(raw[k]) : structuredClone(v);
  for (const [k, v] of Object.entries({ assets: [], nickname: '', source: [], group_only_greetings: [] }))
    if (d[k] === undefined) d[k] = structuredClone(v);
  for (const key of ['alternate_greetings', 'tags', 'group_only_greetings', 'source']) d[key] = arrayField(d[key]);
  if (!d.extensions || typeof d.extensions !== 'object' || Array.isArray(d.extensions)) d.extensions = {};
  if (!d.character_book) {
    d.character_book = structuredClone(
      raw.character_book || d.world_info || raw.world_info || { name: (d.name || '未命名') + '世界书', entries: [] },
    );
    shape.push('已补齐内嵌世界书位置');
  }
  const cb = d.character_book;
  if (typeof cb !== 'object' || Array.isArray(cb)) throw new Error('character_book 必须是世界书对象');
  if (!cb.name) cb.name = (d.name || '未命名') + '世界书';
  if (cb.entries === undefined) cb.entries = [];
  if (!Array.isArray(cb.entries)) {
    if (!cb.entries || typeof cb.entries !== 'object') throw new Error('世界书 entries 不是数组或对象');
    cb.entries = Object.keys(cb.entries)
      .sort((a, b) => Number(a) - Number(b))
      .map(k => cb.entries[k]);
    shape.push('已将世界书条目对象转换为数组');
  }
  if (cb.entries.some(e => e && ('key' in e || 'order' in e || 'disable' in e))) shape.push('已转换酒馆原生世界书字段');
  cb.entries = cb.entries.map(normalizeEntry);
  card.spec = 'chara_card_v3';
  card.spec_version = '3.0';
  return { card, shape };
}
function stripWorkFields(entry) {
  for (const key of INTERNAL_ENTRY_FIELDS) delete entry[key];
  return entry;
}
function cleanForExport(card) {
  const c = structuredClone(card);
  c.spec = 'chara_card_v3';
  c.spec_version = '3.0';
  for (const e of c.data.character_book?.entries || []) stripWorkFields(e);
  const d = c.data;
  return {
    ...c,
    name: d.name,
    description: d.description,
    personality: d.personality,
    scenario: d.scenario,
    first_mes: d.first_mes,
    mes_example: d.mes_example,
    creatorcomment: d.creator_notes,
    avatar: 'none',
    talkativeness: c.talkativeness ?? '0.5',
    fav: c.fav ?? false,
    tags: d.tags,
    create_date: c.create_date || new Date().toISOString(),
  };
}
const DEF = {
  key: [],
  keysecondary: [],
  comment: '',
  content: '',
  constant: false,
  vectorized: false,
  selective: true,
  selectiveLogic: 0,
  addMemo: true,
  order: 100,
  position: 1,
  disable: false,
  excludeRecursion: true,
  preventRecursion: true,
  matchPersonaDescription: false,
  matchCharacterDescription: false,
  matchCharacterPersonality: false,
  matchCharacterDepthPrompt: false,
  matchScenario: false,
  matchCreatorNotes: false,
  delayUntilRecursion: false,
  probability: 100,
  useProbability: true,
  depth: 4,
  group: '',
  groupOverride: false,
  groupWeight: 100,
  scanDepth: 2,
  caseSensitive: false,
  matchWholeWords: true,
  useGroupScoring: false,
  automationId: '',
  role: null,
  sticky: 0,
  cooldown: 0,
  delay: 0,
  uid: 0,
  displayIndex: 0,
  ignoreBudget: false,
  outletName: '',
  triggers: [],
  characterFilter: { isExclude: false, names: [], tags: [] },
};
function exportWorldbook(card) {
  const cb = structuredClone(card.data.character_book || { entries: [] }),
    entries = {};
  for (const [eIndex, source] of (cb.entries || []).entries()) {
    const e = stripWorkFields(structuredClone(source)),
      ext = { ...(e.extensions || {}) },
      ui = {};
    for (const [camel, snake] of Object.entries(NATIVE_EXT_MAP)) {
      if (snake in ext) {
        ui[camel] = ext[snake];
        delete ext[snake];
      } else if (camel in ext) {
        ui[camel] = ext[camel];
        delete ext[camel];
      }
    }
    for (const key of NATIVE_EXT_SAME)
      if (key in ext) {
        ui[key] = ext[key];
        delete ext[key];
      }
    for (const key of [
      'id',
      'keys',
      'secondary_keys',
      'insertion_order',
      'enabled',
      'extensions',
      'position',
      'use_regex',
    ])
      delete e[key];
    entries[String(eIndex)] = {
      ...structuredClone(DEF),
      ...e,
      ...ui,
      uid: eIndex,
      key: structuredClone(source.keys || []),
      keysecondary: structuredClone(source.secondary_keys || []),
      order: source.insertion_order,
      position: source.extensions?.position ?? POS_NUM[source.position] ?? 1,
      disable: !source.enabled,
      useRegex: !!source.use_regex,
      displayIndex: eIndex,
    };
    if (Object.keys(ext).length) entries[String(eIndex)].extensions = ext;
  }
  return { ...cb, entries };
}
