(function (root) {
  'use strict';
  const fields = ['workCount', 'daysSinceLatest', 'latestViews', 'last3AverageViews', 'accountStatus'];
  const ops = ['gt', 'gte', 'lt', 'lte', 'eq'];
  const labels = { workCount: '作品数量', daysSinceLatest: '距最近投稿天数', latestViews: '最近作品播放量', last3AverageViews: '近三条平均播放量', accountStatus: '平台明确显示的账号状态' };
  const symbols = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=' };
  function validate(rule) {
    let count = 0;
    function node(value, depth) {
      if (++count > 200 || depth > 8) throw new Error('规则过大或嵌套超过 8 层');
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('规则节点须为对象');
      if (Object.hasOwn(value, 'mode')) {
        if (!['any', 'all'].includes(value.mode) || !Array.isArray(value.conditions) || !value.conditions.length) throw new Error('条件组须包含 any/all 和非空 conditions');
        if (Object.keys(value).some(key => !['mode', 'conditions'].includes(key))) throw new Error('条件组包含未知字段');
        return { mode: value.mode, conditions: value.conditions.map(child => node(child, depth + 1)) };
      }
      if (Object.keys(value).some(key => !['field', 'op', 'value'].includes(key))) throw new Error('条件包含未知字段');
      if (!fields.includes(value.field) || !ops.includes(value.op)) throw new Error('不支持的字段或比较符');
      if (value.field === 'accountStatus') {
        if (value.op !== 'eq' || typeof value.value !== 'string' || !value.value.trim() || value.value.length > 100) throw new Error('账号状态仅支持非空文字的 eq 比较');
      } else if (typeof value.value !== 'number' || !Number.isFinite(value.value) || value.value < 0) throw new Error('数值条件须为非负有限数字');
      return { field: value.field, op: value.op, value: value.value };
    }
    if (!rule || rule.version !== 1 || typeof rule.name !== 'string' || !rule.name.trim() || rule.name.length > 100) throw new Error('规则须包含 version: 1 和不超过 100 字的 name');
    if (Object.keys(rule).some(key => !['version', 'name', 'group'].includes(key))) throw new Error('规则包含未知字段');
    if (!rule.group || !Object.hasOwn(rule.group, 'mode')) throw new Error('规则须包含 group 条件组');
    return { version: 1, name: rule.name, group: node(rule.group, 0) };
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > 100000) throw new Error('规则文件超过 100 KB 或格式无效');
    return validate(JSON.parse(text));
  }
  function evaluate(rule, values) {
    const checked = validate(rule);
    function visit(node) {
      if (node.mode) {
        const children = node.conditions.map(visit);
        const states = children.map(item => item.state);
        const state = node.mode === 'all'
          ? (states.includes('false') ? 'false' : states.includes('unknown') ? 'unknown' : 'true')
          : (states.includes('true') ? 'true' : states.includes('unknown') ? 'unknown' : 'false');
        return { state, reasons: state === 'true' ? children.filter(item => item.state === 'true').flatMap(item => item.reasons) : [] };
      }
      const actual = values?.[node.field];
      const valid = node.field === 'accountStatus'
        ? typeof actual === 'string' && actual.trim() && actual !== 'unknown' && actual !== '未知'
        : typeof actual === 'number' && Number.isFinite(actual) && actual >= 0;
      if (!valid) return { state: 'unknown', reasons: [] };
      const match = { gt: () => actual > node.value, gte: () => actual >= node.value, lt: () => actual < node.value, lte: () => actual <= node.value, eq: () => actual === node.value }[node.op]();
      return { state: match ? 'true' : 'false', reasons: match ? [`${labels[node.field]} ${symbols[node.op]} ${node.value}（当前 ${actual}）`] : [] };
    }
    const result = visit(checked.group);
    return { ...result, match: result.state === 'true' };
  }
  const api = Object.freeze({ validate, parse, evaluate });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FollowRules = api;
})(globalThis);
