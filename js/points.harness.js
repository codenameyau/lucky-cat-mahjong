'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const OPTION_IDS = [
  'opt-selfdraw',
  'opt-concealed',
  'opt-lasttile',
  'opt-robkong',
  'opt-kongwin',
  'opt-double-kong',
  'opt-no-flowers',
  'opt-unlimited',
];

function createScoringApi() {
  const checkboxes = {};
  const selects = {
    'opt-seat': { value: '1' },
    'opt-round': { value: '1' },
  };

  OPTION_IDS.forEach(function (id) {
    checkboxes[id] = { checked: id === 'opt-no-flowers' };
  });

  const sandbox = {
    checkboxes: checkboxes,
    selects: selects,
    URLSearchParams: URLSearchParams,
    document: {
      getElementById: function (id) {
        if (id === 'opt-seat' || id === 'opt-round') return selects[id];
        return checkboxes[id] || null;
      },
      querySelectorAll: function () { return []; },
      readyState: 'complete',
      addEventListener: function () {},
    },
    history: { replaceState: function () {} },
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
    },
    matchMedia: function () { return { matches: true }; },
    navigator: {
      clipboard: { writeText: function () { return Promise.resolve(); } },
    },
    __POINTS_TEST_API__: null,
  };
  sandbox.window = sandbox;

  const source = fs.readFileSync(path.join(__dirname, 'points.js'), 'utf8');
  const injected = source.replace(
    '  if (document.readyState === \'loading\') {\n' +
    '    document.addEventListener(\'DOMContentLoaded\', init);\n' +
    '  } else {\n' +
    '    init();\n' +
    '  }\n' +
    '})();',
    '  __POINTS_TEST_API__ = {\n' +
    '    evaluate: evaluate,\n' +
    '    isValidWinningHandIds: isValidWinningHandIds,\n' +
    '    patternFaanForIds: patternFaanForIds,\n' +
    '    buildStandardHand: buildStandardHand,\n' +
    '    handLengthForMeldPlan: handLengthForMeldPlan,\n' +
    '    randomStandardHand: randomStandardHand,\n' +
    '    randomChickenHand: randomChickenHand,\n' +
    '    randomSequenceHand: randomSequenceHand,\n' +
    '    randomLimitHand: randomLimitHand,\n' +
    '    setHand: function (tiles, bonusTiles) {\n' +
    '      hand = tiles || [];\n' +
    '      flowers = bonusTiles || [];\n' +
    '      syncHandLayoutFromArrays();\n' +
    '    },\n' +
    '    setOption: function (id, value) {\n' +
    '      if (id === \'opt-seat\' || id === \'opt-round\') {\n' +
    '        selects[id].value = String(value);\n' +
    '        return;\n' +
    '      }\n' +
    '      if (checkboxes[id]) checkboxes[id].checked = !!value;\n' +
    '    },\n' +
    '    setSpicyMode: function (mode) {\n' +
    '      spicyMode = mode === \'half\' ? \'half\' : \'full\';\n' +
    '    },\n' +
    '    faanToPoints: faanToPoints,\n' +
    '    resetOptions: function () {\n' +
    '      var optionIds = [\n' +
    '        \'opt-selfdraw\', \'opt-concealed\', \'opt-lasttile\', \'opt-robkong\',\n' +
    '        \'opt-kongwin\', \'opt-double-kong\', \'opt-no-flowers\', \'opt-unlimited\'\n' +
    '      ];\n' +
    '      optionIds.forEach(function (optionId) {\n' +
    '        checkboxes[optionId].checked = optionId === \'opt-no-flowers\';\n' +
    '      });\n' +
    '      selects[\'opt-seat\'].value = \'1\';\n' +
    '      selects[\'opt-round\'].value = \'1\';\n' +
    '    },\n' +
    '    loadFromQuery: function (search) {\n' +
    '      var query = search.charAt(0) === \'?\' ? search.slice(1) : search;\n' +
    '      var params = new URLSearchParams(query);\n' +
    '      loadHandFromQuery(params);\n' +
    '      loadFlowersFromQuery(params);\n' +
    '      loadOptionsFromQuery(params);\n' +
    '      syncHandLayoutFromArrays();\n' +
    '    },\n' +
    '  };\n' +
    '})();'
  );

  vm.runInNewContext(injected, sandbox);
  return sandbox.__POINTS_TEST_API__;
}

module.exports = { createScoringApi, OPTION_IDS };
