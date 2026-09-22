/* ════════ 一、常量与段位表 ════════ */

const SEGMENTS = [
  { id: 'clear', label: '🗑️清空局部变量', pos: 'before_char', trigger: false, wrap: false },
  { id: 'memory', label: '记忆相关', pos: 'after_char', trigger: false, wrap: true },
  { id: 'output', label: '输出规则', pos: 'after_char', trigger: false, wrap: true },
  { id: 'rule', label: '核心规则', pos: 'after_char', trigger: false, wrap: true },
  { id: 'setting', label: '核心设定', pos: 'after_char', trigger: true, wrap: true },
  { id: 'female', label: '女性角色', pos: 'after_char', trigger: true, wrap: true },
  { id: 'male', label: '男性角色', pos: 'after_char', trigger: true, wrap: true },
  { id: 'other', label: '其他角色', pos: 'after_char', trigger: true, wrap: true },
  { id: 'place', label: '地点', pos: 'after_char', trigger: true, wrap: true },
];
const SEG = Object.fromEntries(SEGMENTS.map(s => [s.id, s]));
const POS_NUM = { before_char: 0, after_char: 1, before_an: 2, after_an: 3, at_depth: 4 };
// ccv3 顶层只用 before_char / after_char；特殊位置以 extensions.position 为准。
const NUM_POS = {
  0: 'before_char',
  1: 'after_char',
  2: 'after_char',
  3: 'after_char',
  4: 'after_char',
  5: 'after_char',
  6: 'after_char',
  7: 'after_char',
};

// 酒馆 ccv3 导出口径的 extensions 全量字段（照合格样本卡逐字对齐）
const EXT_TPL = {
  position: 1,
  exclude_recursion: false,
  display_index: 0,
  probability: 100,
  useProbability: true,
  depth: 4,
  selectiveLogic: 0,
  outlet_name: '',
  group: '',
  group_override: false,
  group_weight: 100,
  prevent_recursion: false,
  delay_until_recursion: false,
  scan_depth: 2,
  match_whole_words: true,
  use_group_scoring: false,
  case_sensitive: false,
  automation_id: '',
  role: null,
  vectorized: false,
  sticky: 0,
  cooldown: 0,
  delay: 0,
  match_persona_description: false,
  match_character_description: false,
  match_character_personality: false,
  match_character_depth_prompt: false,
  match_scenario: false,
  match_creator_notes: false,
  triggers: [],
  ignore_budget: false,
};
const CARD_FIELDS = {
  name: '',
  description: '',
  personality: '',
  scenario: '',
  first_mes: '',
  mes_example: '',
  creator_notes: '',
  system_prompt: '',
  post_history_instructions: '',
  alternate_greetings: [],
  tags: [],
  creator: '',
  character_version: '',
  extensions: {},
};
const CLEAR_CONTENT = `{{setvar::combat_driver::}}
{{setvar::status_format::}}
{{setvar::世界书重大记忆存储::}}
{{setvar::世界书日常记忆存储::}}
{{setvar::世界书玩家身世背景::}}`;

/* 分区判定：从上往下，第一条命中即用 */
const CLASSIFY = [
  ['clear', /清空局部变量|^\s*🗑/],
  ['memory', /^【?记忆相关|记忆存储|玩家身世背景/],
  ['rule', /^剧情总纲|^总纲|^世界观总纲/],
  ['output', /^【?输出规则|^输出[:：·]|^时间线|^剧情[:：·]|战斗思维链|思维链|状态栏|占位符/],
  [
    'rule',
    /^【?核心规则|^核心规则[:：·]|^规则[:：·]|校验|过滤|时代锚定|叙述.{0,4}规范|物价|金钱|话题池|彩蛋|扮演指南|尺度/,
  ],
  ['setting', /^【?核心设定|^核心设定[:：·_]|^设定[:：·_]/],
  ['place', /^【?地点|^地点[:：·_]/],
  ['other', /^【?其他角色|^其他角色[:：·_]|^配角[:：·_]|^龙套/],
  [
    'chara',
    /^【?[女男]性角色|^[女男]性角色[:：·_]|^[女男][\s:：·\/]|^【?主要角色|^主要角色[:：·_]|^角色[:：·_]|^人物[:：·_]/,
  ],
];
const CLASSIFY_CONTENT = [
  ['output', /<world_timeline>|\{\{setvar::status_format|\{\{setvar::combat_driver|<status_format>|<combat_driver>/],
  ['rule', /<easter_eggs>|<核心规则[:：]/],
  ['place', /<地点[:：]/],
  ['setting', /<核心设定[:：]|<设定[_:：]/],
  ['chara', /<[^>\s]*character>|(^|\n)\s*性别\s*[:：]\s*[男女]/],
  ['clear', /\{\{setvar::[^:]*::\}\}/],
];
const TIMELINE_RE = /^时间线|^剧情[:：·]|<world_timeline>/;
const MARKER_RE = /^【.+[:：](起始|结尾)】/;
