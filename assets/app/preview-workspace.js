/* A new public installation starts empty, in its own browser namespace. */
(function () {
  'use strict';
  window.TravelPreview = {
    scope: 'travel-atlas-public-v1',
    async load() {
      if (location.protocol === 'file:') throw Error('请使用 python3 scripts/start.py 启动旅行手册。');
      return { values: {}, media: { memories: [], references: [], memoirs: [] },
        expectedHash: null, revision: 0, dirty: false, generation: 0,
        updatedAt: new Date().toISOString() };
    }
  };
})();
