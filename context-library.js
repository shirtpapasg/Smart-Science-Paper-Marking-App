// The context library — everyday situations the practice generator may use.
//
// WHY THIS FILE EXISTS
// A generator left to invent its own situations will confidently produce
// out-of-syllabus questions — ranking copper against aluminium, say, which the
// P4 Heat syllabus explicitly excludes. It is not uncertain when it does this,
// so no confidence score catches it. Restricting it to a list you own removes
// the whole class of error.
//
// HOW TO EDIT
// Every entry is plain text. Add, remove or reword freely — no code knowledge
// needed. Two rules for a good context:
//   1. It names TWO contrasting things in ONE situation, so there is something
//      to compare.
//   2. A 9-to-12-year-old in Singapore has actually touched or seen it.
// If a child has never met the object, the question tests reading rather than
// science. Four to six contexts per concept is the right number: fewer and the
// questions repeat, more and the list stops being reviewable.
//
// `match` is the words used to find the right concept — lower case, any order.

export const CONTEXTS = [
  {
    concept: 'metal is a good conductor of heat, plastic and wood are poor conductors',
    match: ['conductor', 'insulator', 'conducts heat'],
    level: 'P4',
    contexts: [
      { object: 'metal spoon and wooden spoon in a mug of hot Milo',
        parts: ['mug', 'drink line', 'metal spoon', 'wooden spoon'] },
      { object: 'steel kettle with a moulded plastic grip, just after boiling',
        parts: ['kettle body', 'spout', 'plastic grip', 'steam'] },
      { object: 'clothes iron with a metal plate and a plastic handle',
        parts: ['iron body', 'metal plate', 'plastic handle', 'cloth'] },
      { object: 'oven mitt used to lift a metal tray out of a toaster oven',
        parts: ['tray', 'mitt', 'hand', 'oven shelf'] },
      { object: 'metal railing and wooden bench in the void deck on a hot afternoon',
        parts: ['railing', 'bench', 'sun'] },
      { object: 'wok with a metal body and a wooden handle on a stove',
        parts: ['wok', 'wooden handle', 'flame'] },
    ],
  },
  {
    concept: 'water vapour loses heat to a cooler surface and condenses into water droplets',
    match: ['condense', 'condensation', 'water vapour', 'droplets'],
    level: 'P5',
    contexts: [
      { object: 'bathroom mirror after a hot shower',
        parts: ['mirror', 'droplets', 'warm air'] },
      { object: 'cold can of drink taken out of the fridge on a humid day',
        parts: ['can', 'droplets on the outside', 'surrounding air'] },
      { object: 'spectacles fogging up when walking out of an air-conditioned mall',
        parts: ['lens', 'warm outside air', 'droplets'] },
      { object: 'plastic bag tied over a potted plant left in the sun',
        parts: ['leaves', 'bag', 'droplets on the inside'] },
      { object: 'lid of a pot of soup lifted after simmering',
        parts: ['pot', 'lid', 'droplets underneath', 'steam'] },
      { object: 'cold water bottle in a school bag on a warm day',
        parts: ['bottle', 'droplets', 'bag'] },
    ],
  },
  {
    concept: 'a poor conductor traps a layer of air and slows the rate of heat loss',
    match: ['traps air', 'slows heat loss', 'insulates', 'keeps warm'],
    level: 'P4',
    contexts: [
      { object: 'cardboard sleeve around a hot takeaway coffee cup',
        parts: ['cup', 'sleeve', 'hand'] },
      { object: 'thermos flask with a double wall, holding hot water',
        parts: ['outer wall', 'inner wall', 'gap', 'hot water'] },
      { object: 'towel wrapped around a bowl of hot porridge',
        parts: ['bowl', 'towel', 'porridge'] },
      { object: 'foam box used by a hawker to carry hot food',
        parts: ['foam box', 'lid', 'food'] },
      { object: 'jacket worn in a cold cinema',
        parts: ['jacket', 'body', 'cool air'] },
    ],
  },
  {
    concept: 'water gains heat from a surface and evaporates, removing heat and cooling it',
    match: ['evaporat', 'cooling', 'sweat', 'dries'],
    level: 'P5',
    contexts: [
      { object: 'sweat on your skin after PE, with a fan blowing',
        parts: ['skin', 'sweat', 'fan', 'moving air'] },
      { object: 'wet towel spread out on a line versus folded in a heap',
        parts: ['spread towel', 'folded towel', 'sun'] },
      { object: 'water sprayed on a hot pavement in the afternoon',
        parts: ['pavement', 'water', 'sun'] },
      { object: 'clothes drying on a rack indoors versus at a sunny window',
        parts: ['rack indoors', 'rack at window', 'sunlight'] },
      { object: 'wet hands held under a hand dryer',
        parts: ['hands', 'water', 'warm moving air'] },
    ],
  },
  {
    concept: 'materials expand when heated and contract when cooled, and uneven expansion causes cracks',
    match: ['expand', 'contract', 'gaps', 'cracks'],
    level: 'P4',
    contexts: [
      { object: 'gaps left between concrete slabs on a covered walkway',
        parts: ['slabs', 'gaps', 'sun'] },
      { object: 'glass cup that cracks when boiling water is poured in',
        parts: ['inner wall', 'outer wall', 'boiling water'] },
      { object: 'metal lid on a glass jar loosened by running it under hot water',
        parts: ['metal lid', 'glass rim', 'hot water'] },
      { object: 'overhead bridge with a small gap in the roadway',
        parts: ['road sections', 'gap'] },
      { object: 'metal ruler left on a hot window ledge',
        parts: ['ruler', 'ledge', 'sun'] },
    ],
  },
  {
    concept: 'water and food are transported in separate tubes in a plant',
    match: ['transport', 'tubes', 'water-carrying', 'food-carrying'],
    level: 'P5',
    contexts: [
      { object: 'celery stalk standing in a cup of coloured water',
        parts: ['stalk', 'coloured water', 'stained lines'] },
      { object: 'ring of bark removed from a young tree in a park',
        parts: ['trunk', 'removed ring', 'leaves above', 'roots below'] },
      { object: 'cut flowers in a vase that wilt after the stems are crushed',
        parts: ['stems', 'vase water', 'drooping petals'] },
      { object: 'white chrysanthemum left in blue dye overnight',
        parts: ['stem', 'dye', 'petals'] },
      { object: 'branch snapped part-way through but still attached',
        parts: ['branch', 'break point', 'leaves beyond'] },
    ],
  },
  {
    concept: 'light travels in a straight line, and a shadow forms when an object blocks it',
    match: ['shadow', 'blocks light', 'straight line', 'opaque'],
    level: 'P4',
    contexts: [
      { object: 'hand held between a torch and a bedroom wall',
        parts: ['torch', 'hand', 'wall', 'shadow'] },
      { object: 'umbrella held up on a sunny walk to school',
        parts: ['umbrella', 'sun', 'shadow on the path'] },
      { object: 'shadow puppet moved closer to and further from a lamp',
        parts: ['lamp', 'puppet', 'screen'] },
      { object: 'window with a curtain, a net and a clear pane',
        parts: ['clear pane', 'net', 'curtain', 'light inside'] },
      { object: 'tree shadow on the field at nine in the morning and again at noon',
        parts: ['tree', 'sun', 'shadow length'] },
    ],
  },
  {
    concept: 'living things need air, water and food to survive',
    match: ['survive', 'needs air', 'needs water', 'living things'],
    level: 'P3',
    contexts: [
      { object: 'two sealed jars of mung beans, one with water and one without',
        parts: ['jar with water', 'dry jar', 'beans'] },
      { object: 'fish tank with a broken air pump',
        parts: ['tank', 'fish', 'pump', 'water plants'] },
      { object: 'plant kept in a dark store room for a week',
        parts: ['plant', 'dark room', 'yellow leaves'] },
      { object: 'insects in a container with holes in the lid versus a sealed one',
        parts: ['container with holes', 'sealed container', 'insects'] },
      { object: 'potted plant that was not watered over the school holidays',
        parts: ['pot', 'dry soil', 'drooping leaves'] },
    ],
  },
];

// Finds the contexts for a concept. Falls back to null rather than guessing,
// so a concept with no library entry is generated freely and flagged instead.
export function contextsFor(concept) {
  const c = String(concept || '').toLowerCase();
  const hit = CONTEXTS.find(e => e.match.some(m => c.includes(m)));
  return hit || null;
}

export const STATS = {
  concepts: CONTEXTS.length,
  contexts: CONTEXTS.reduce((n, e) => n + e.contexts.length, 0),
};
