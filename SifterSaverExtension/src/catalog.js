/* Sifter Saver — static catalog of games and option labels.
 * Values mirror what the Seller Portal quicklist bundle renders, so presets
 * can be validated and summarised without touching the page. */
(function () {
  'use strict';
  const SS = (globalThis.SifterSaver = globalThis.SifterSaver || {});

  const GAMES = [
    { code: 'MTG', name: 'Magic: The Gathering', productLineId: 1 },
    { code: 'PKM', name: 'Pokémon', productLineId: 3 },
    { code: 'YGO', name: 'Yu-Gi-Oh!', productLineId: 2 },
    { code: 'ONE', name: 'One Piece', productLineId: 4 },
    { code: 'LOR', name: 'Lorcana', productLineId: 5 },
  ];

  const JOB_TYPES = {
    'sift-only': 'Sift only',
    'scan-and-sift': 'Scan & sift',
    'scan-only': 'Scan only',
  };

  // Criteria the site hides per game (see JobConfig `$` computed).
  const HIDDEN_CRITERIA = {
    YGO: ['color', 'foil', 'rarity'],
    ONE: ['color'],
  };

  // Label used on the criteria card and on the select for the "color" criterion.
  const COLOR_CARD_LABEL = { PKM: 'Energy', LOR: 'Ink type' };
  const COLOR_SELECT_LABEL = { PKM: 'Energy type', LOR: 'Ink type' };

  const RARITY = {
    MTG: ['Common', 'Uncommon', 'Rare', 'Mythic', 'Land', 'Token'],
    PKM: ['Common', 'Uncommon', 'Rare', 'Ultra Rare', 'Secret Rare'],
    YGO: [],
    ONE: [],
    LOR: [],
  };

  const COLOR = {
    MTG: ['Black', 'Blue', 'Colorless', 'Green', 'Red', 'White'],
    PKM: ['Colorless', 'Darkness', 'Dragon', 'Fairy', 'Fighting', 'Fire', 'Grass', 'Lightning', 'Metal', 'Psychic', 'Water'],
    YGO: [],
    ONE: [],
    LOR: ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'],
  };

  const FOIL_FINISH = {
    MTG: ['Foil', 'Special Foil'],
    PKM: ['Holofoil', 'Reverse Holo'],
    YGO: ['Partial or No Foiling', 'Full Foiling'],
    ONE: ['Foil', 'Jolly Roger Foil', 'Textured Foil'],
    LOR: ['Cold Foil', 'Holofoil'],
  };

  const CONDITIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];

  // Conditions the site allows when the price criterion is selected.
  const PRICE_SIFT_CONDITIONS = {
    MTG: ['Near Mint', 'Lightly Played', 'Moderately Played'],
    PKM: ['Near Mint', 'Lightly Played', 'Moderately Played'],
    default: ['Near Mint'],
  };

  const CRITERIA_ORDER = ['price', 'rarity', 'color', 'foil'];

  function normalize(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  const NAME_ALIASES = {
    magicthegathering: 'MTG', magic: 'MTG', mtg: 'MTG', magicthegatheringtcg: 'MTG',
    pokemon: 'PKM', pokemontcg: 'PKM', pkm: 'PKM',
    yugioh: 'YGO', ygo: 'YGO',
    onepiece: 'ONE', onepiececardgame: 'ONE', one: 'ONE',
    lorcana: 'LOR', lorcanatcg: 'LOR', disneylorcana: 'LOR', lor: 'LOR',
  };

  function gameCodeFromName(name) {
    if (!name) return null;
    const n = normalize(name);
    const hit = GAMES.find((g) => normalize(g.name) === n || normalize(g.code) === n);
    return hit ? hit.code : NAME_ALIASES[n] || null;
  }

  function gameName(code) {
    const g = GAMES.find((x) => x.code === code);
    return g ? g.name : code || '';
  }

  function jobTypeFromTitle(title) {
    const t = String(title || '').toLowerCase();
    if (t.startsWith('sift job')) return 'sift-only';
    if (t.startsWith('scan job')) return 'scan-only';
    if (t.includes('sift')) return 'scan-and-sift';
    return null;
  }

  function criterionIdFromLabel(label) {
    const l = String(label || '').trim().toLowerCase();
    if (l === 'price') return 'price';
    if (l === 'rarity') return 'rarity';
    if (l === 'foil') return 'foil';
    return 'color';
  }

  function colorSelectLabel(code) {
    return COLOR_SELECT_LABEL[code] || 'Color';
  }

  function colorCardLabel(code) {
    return COLOR_CARD_LABEL[code] || 'Color';
  }

  function priceSiftConditions(code) {
    return PRICE_SIFT_CONDITIONS[code] || PRICE_SIFT_CONDITIONS.default;
  }

  function availableCriteria(code) {
    const hidden = HIDDEN_CRITERIA[code] || [];
    return CRITERIA_ORDER.filter((c) => !hidden.includes(c));
  }

  SS.catalog = {
    GAMES, JOB_TYPES, RARITY, COLOR, FOIL_FINISH, CONDITIONS, CRITERIA_ORDER,
    gameCodeFromName, gameName, jobTypeFromTitle, criterionIdFromLabel,
    colorSelectLabel, colorCardLabel, priceSiftConditions, availableCriteria,
    normalize,
  };
})();
