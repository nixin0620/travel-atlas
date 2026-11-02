/* Pure packing state operations; also runnable with Node for regression tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PackingCore = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const clean = (value, max = 120) => String(value == null ? '' : value).trim().slice(0, max);
  const uid = () => 'p-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const key = name => clean(name).normalize('NFKC').replace(/[\s·・]/g, '').toLowerCase();
  function item(value, id) {
    if (!value || typeof value !== 'object' || !clean(value.name)) throw new Error('请填写物品或待办名称。');
    let quantity = value.quantity;
    if (quantity == null || quantity === '') quantity = null;
    else {
      quantity = Number(quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new Error('数量请填写 1–999 的整数，或留空。');
    }
    return {id: id || clean(value.id, 100) || uid(), name: clean(value.name), emoji: clean(value.emoji || '🎒', 24), quantity, note: clean(value.note, 600), timing: clean(value.timing, 80), done: value.done === true};
  }
  function validate(state) {
    if (!state || state.version !== 3 || !Array.isArray(state.categories) || state.categories.length > 51 || !state.categories.length) throw new Error('清单数据格式不正确。');
    const ids = new Set();
    let count = 0;
    const categories = state.categories.map(c => {
      if (!c || !clean(c.id, 100) || ids.has(c.id) || !clean(c.name) || !Array.isArray(c.items)) throw new Error('分类名称或标识不正确。');
      ids.add(c.id);
      return {id: clean(c.id, 100), name: clean(c.name, 50), emoji: clean(c.emoji || '🎒', 24), items: c.items.map(i => {
        const next = item(i);
        if (ids.has(next.id)) throw new Error('清单中出现了重复标识。');
        ids.add(next.id); count++; return next;
      })};
    });
    if (count > 1000 || categories[0].id !== 'todo' || categories.filter(c => c.id === 'todo').length !== 1) throw new Error('清单过大或缺少独立待办。');
    return {version: 3, categories, todo_revision: Number.isInteger(state.todo_revision) ? state.todo_revision : 0, dismissed: Array.isArray(state.dismissed) ? [...new Set(state.dismissed.map(n => clean(n)).filter(Boolean))].slice(-1000) : []};
  }
  function initial(seed, legacy = {}, packingIndices = [], todoIndices = []) {
    packingIndices = Array.isArray(packingIndices) ? packingIndices : [];
    todoIndices = Array.isArray(todoIndices) ? todoIndices : [];
    legacy = legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {};
    const categories = [{id: 'todo', name: '出发前待办', emoji: '⏰', items: seed.todos || []}, ...seed.categories];
    const state = {version: 3, todo_revision: seed.todo_revision || 0, categories: categories.map(c => ({...c, items: c.items.map(i => {
      const result = item(i);
      if (i.legacy_key && legacy) {
        const lk = i.legacy_key.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (Object.prototype.hasOwnProperty.call(legacy, lk)) result.done = legacy[lk] === true;
        else result.done = ((i.legacy_source || (c.id === 'todo' ? 'todo' : 'packing')) === 'todo' ? todoIndices : packingIndices).includes(i.legacy_index);
      } else if (Number.isInteger(i.legacy_index)) result.done = ((i.legacy_source || (c.id === 'todo' ? 'todo' : 'packing')) === 'todo' ? todoIndices : packingIndices).includes(i.legacy_index);
      return result;
    })}))};
    return validate(state);
  }
  function refreshTodos(state, seed) {
    const next = validate(state);
    if (!seed.todo_revision || next.todo_revision >= seed.todo_revision) return next;
    const retired = new Set(seed.previous_todo_ids || []);
    const todo = next.categories[0], previous = todo.items;
    const retained = previous.filter(i => !retired.has(i.id));
    const occupied = next.categories.flatMap(c => c.id === 'todo' ? retained : c.items);
    const ids = new Set(occupied.map(i => i.id));
    const names = new Set([...occupied.map(i => key(i.name)), ...next.dismissed.map(key)]);
    const fresh = (seed.todos || []).filter(i => !ids.has(i.id) && !names.has(key(i.name))).map(i => {
      const same = previous.find(old => key(old.name) === key(i.name));
      return item({...i, done: same ? same.done : false});
    });
    todo.items = [...fresh, ...retained];
    next.todo_revision = seed.todo_revision;
    return validate(next);
  }
  function find(state, id) {
    for (const category of state.categories) {
      const index = category.items.findIndex(i => i.id === id);
      if (index !== -1) return {category, index, item: category.items[index]};
    }
    throw new Error('这条内容已不存在，请重新打开清单。');
  }
  function category(state, id) {
    const result = state.categories.find(c => c.id === id);
    if (!result) throw new Error('这个分类已不存在。');
    return result;
  }
  function visibleItems(category, onlyPending) {
    const sorted = [...category.items.filter(i => !i.done), ...category.items.filter(i => i.done)];
    return onlyPending ? sorted.filter(i => !i.done) : sorted;
  }
  function stats(state, todos = false) {
    const all = state.categories.filter(c => (c.id === 'todo') === todos).flatMap(c => c.items);
    const done = all.filter(i => i.done).length;
    return {done, total: all.length, percent: all.length ? Math.round(done / all.length * 100) : 0};
  }
  function apply(state, action) {
    const next = clone(state);
    let c, found;
    switch (action.type) {
      case 'toggle': find(next, action.id).item.done = action.done === true; break;
      case 'save-item':
        c = category(next, action.categoryId);
        if (action.id) {
          found = find(next, action.id);
          const updated = item({...action.value, done: found.item.done}, action.id);
          found.category.items.splice(found.index, 1);
          c.items.splice(found.category.id === c.id ? found.index : c.items.length, 0, updated);
        } else c.items.push(item(action.value));
        next.dismissed = next.dismissed.filter(n => key(n) !== key(action.value.name));
        break;
      case 'delete-item': found = find(next, action.id); next.dismissed.push(found.item.name); found.category.items.splice(found.index, 1); break;
      case 'save-category':
        if (!clean(action.name, 50)) throw new Error('请填写分类名称。');
        if (action.id === 'todo') throw new Error('出发前待办保持独立。');
        if (next.categories.some(c => c.id !== action.id && key(c.name) === key(action.name))) throw new Error('已有同名分类，请换一个名称。');
        if (action.id) { c = category(next, action.id); c.name = clean(action.name, 50); c.emoji = clean(action.emoji || '🎒', 24); }
        else next.categories.push({id: uid(), name: clean(action.name, 50), emoji: clean(action.emoji || '🎒', 24), items: []});
        break;
      case 'delete-category':
        if (action.id === 'todo') throw new Error('出发前待办保持独立。');
        next.dismissed.push(...category(next, action.id).items.map(i => i.name)); next.categories = next.categories.filter(c => c.id !== action.id); break;
      case 'move-category': {
        const index = next.categories.findIndex(c => c.id === action.id), target = index + action.delta;
        if (index > 0 && target > 0 && target < next.categories.length) next.categories.splice(target, 0, next.categories.splice(index, 1)[0]);
        break;
      }
      case 'move-item': {
        found = find(next, action.id); c = category(next, action.categoryId);
        if (action.id === action.beforeId) break;
        const moved = found.category.items.splice(found.index, 1)[0];
        const index = action.beforeId ? c.items.findIndex(i => i.id === action.beforeId) : -1;
        c.items.splice(index === -1 ? c.items.length : index, 0, moved); break;
      }
      case 'step-item': {
        found = find(next, action.id);
        const group = found.category.items.filter(i => i.done === found.item.done);
        const from = group.findIndex(i => i.id === action.id), to = from + action.delta;
        if (to >= 0 && to < group.length) {
          const a = found.index, b = found.category.items.findIndex(i => i.id === group[to].id);
          [found.category.items[a], found.category.items[b]] = [found.category.items[b], found.category.items[a]];
        }
        break;
      }
      default: throw new Error('未知操作。');
    }
    return validate(next);
  }
  function suggestions(values) {
    if (!Array.isArray(values) || values.length > 100) throw new Error('建议应为最多 100 项的 JSON 数组。');
    return values.map(value => {
      const normalized = item(value);
      if (!clean(value.reason, 600)) throw new Error('每条建议都需要 reason 推荐理由。');
      return {...normalized, id: uid(), done: false, category_id: clean(value.category_id, 100), category_name: clean(value.category_name || '行程专属', 50), category_emoji: clean(value.category_emoji || '🎒', 24), reason: clean(value.reason, 600)};
    });
  }
  function missing(state, values) {
    const seen = new Set([...state.categories.flatMap(c => c.items.map(i => key(i.name))), ...(state.dismissed || []).map(key)]);
    return values.filter(i => { const k = key(i.name); if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function addSuggestions(state, values) {
    let next = clone(state);
    for (const suggestion of missing(next, values)) {
      let target = next.categories.find(c => c.id === suggestion.category_id) || next.categories.find(c => key(c.name) === key(suggestion.category_name));
      if (!target) {
        target = {id: uid(), name: suggestion.category_name, emoji: suggestion.category_emoji, items: []};
        next.categories.push(target);
      }
      target.items.push(item({...suggestion, note: suggestion.note || suggestion.reason, done: false}, uid()));
    }
    return validate(next);
  }
  return {clone, clean, uid, key, item, validate, initial, refreshTodos, find, category, visibleItems, stats, apply, suggestions, missing, addSuggestions};
});
