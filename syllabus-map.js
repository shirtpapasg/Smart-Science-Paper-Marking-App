/* The primary science syllabus as a map: five themes, the chapters under each
   by level, and the vocabulary the app tags with — six science skills and the
   nine 21st-century competency areas. Names are the syllabus's own. The
   colours are the same five the teacher's skillset map and Pair Lab use, so a
   theme looks the same everywhere. No school is named anywhere in this file. */
var SYLLABUS = {
  themes: [
    { key: 'Diversity',    col: '#33cc77', icon: '🌿', blurb: 'What living and non-living things there are, and how we group them.' },
    { key: 'Cycles',       col: '#33ddff', icon: '🔄', blurb: 'Life cycles, reproduction, water, and the states of matter.' },
    { key: 'Systems',      col: '#aa55ff', icon: '🫀', blurb: 'Plant systems, human systems and electrical systems.' },
    { key: 'Energy',       col: '#ffaa33', icon: '⚡', blurb: 'Light, shadows, heat, photosynthesis and energy conversion.' },
    { key: 'Interactions', col: '#ff4455', icon: '🧲', blurb: 'Magnets, forces, and living things in their environment.' },
  ],
  chapters: [
    { name: 'Diversity of Living and Non-living Things', theme: 'Diversity', levels: ['P3'], match: /living|non-living|non living/ },
    { name: 'Classification of Living Things',           theme: 'Diversity', levels: ['P3'], match: /classif|group|fungi|bacteria|mammal|bird|insect|flowering/ },
    { name: 'Diversity of Materials',                    theme: 'Diversity', levels: ['P3'], match: /material|fabric|waterproof|flexib|strength of/ },
    { name: 'Life Cycles of Plants',                     theme: 'Cycles',    levels: ['P3'], match: /life cycle.*plant|seed|germinat|seedling/ },
    { name: 'Life Cycles of Animals',                    theme: 'Cycles',    levels: ['P3'], match: /life cycle|larva|pupa|tadpole|egg/ },
    { name: 'Reproduction in Animals and Plants',        theme: 'Cycles',    levels: ['P5'], match: /reproduc|pollinat|fertilis|seed dispersal|dispers|flower|fruit/ },
    { name: 'Cycles in Water',                           theme: 'Cycles',    levels: ['P5'], match: /water cycle|evaporat|condens|boil|freez|melt|three states|states of water/ },
    { name: 'Matter',                                    theme: 'Cycles',    levels: ['P4'], match: /matter|solid|liquid|gas|mass|volume/ },
    { name: 'Plant System',                              theme: 'Systems',   levels: ['P4'], match: /plant system|plant part|root|stem|leaf|leaves/ },
    { name: 'Human Systems',                             theme: 'Systems',   levels: ['P4'], match: /human system|digest|skeleton|skeletal|muscul|stomach|intestine/ },
    { name: 'Plant Transport System',                    theme: 'Systems',   levels: ['P5'], match: /transport|xylem|phloem|food-carrying|water-carrying/ },
    { name: 'Respiratory and Circulatory Systems',       theme: 'Systems',   levels: ['P5'], match: /respirat|circulat|heart|lung|blood|breath|oxygen/ },
    { name: 'Electrical Systems',                        theme: 'Systems',   levels: ['P5'], match: /electric|circuit|battery|bulb|switch|conductor of electricity/ },
    { name: 'Series and Parallel Circuits',              theme: 'Systems',   levels: ['P5'], match: /series|parallel/ },
    { name: 'Light',                                     theme: 'Energy',    levels: ['P4'], match: /light(?!ning)|see|reflect|source of light/ },
    { name: 'Shadows',                                   theme: 'Energy',    levels: ['P4'], match: /shadow/ },
    { name: 'Heat',                                      theme: 'Energy',    levels: ['P4'], match: /heat|temperature|thermometer/ },
    { name: 'Effects of Heat',                           theme: 'Energy',    levels: ['P4'], match: /expand|contract|conductor of heat|good conductor|poor conductor|insulat/ },
    { name: 'Photosynthesis',                            theme: 'Energy',    levels: ['P6'], match: /photosynth|energy in food|food chain|food web|producer|consumer|chlorophyll/ },
    { name: 'Energy Conversion',                         theme: 'Energy',    levels: ['P6'], match: /energy conver|forms of energy|kinetic|potential|sound energy|electrical energy/ },
    { name: 'Properties of Magnets',                     theme: 'Interactions', levels: ['P3'], match: /magnet/ },
    { name: 'Making and Using Magnets',                  theme: 'Interactions', levels: ['P3'], match: /making magnet|stroke|electromagnet/ },
    { name: 'Interaction of Forces',                     theme: 'Interactions', levels: ['P6'], match: /force|friction|gravit|spring|elastic|push|pull/ },
    { name: 'Interactions Within the Environment',       theme: 'Interactions', levels: ['P6'], match: /environment|habitat|population|community|living together|predator|prey|adapt/ },
    { name: 'Surviving in the Environment',              theme: 'Interactions', levels: ['P6'], match: /surviv|people and environment|pollution|conserv|deforest/ },
  ],
  // The app's own chapter titles, mapped to the syllabus chapter they belong to.
  aliases: {
    'living and non-living things': 'Diversity of Living and Non-living Things',
    'materials': 'Diversity of Materials',
    'life cycles': 'Life Cycles of Animals',
    'plant systems': 'Plant System',
    'human systems': 'Human Systems',
    'matter': 'Matter',
    'heat energy': 'Heat',
    'light energy & shadow': 'Shadows',
    'plant and human reproduction': 'Reproduction in Animals and Plants',
    'water and the three states': 'Cycles in Water',
    'energy in food': 'Photosynthesis',
    'eight forms of energy': 'Energy Conversion',
    'forces': 'Interaction of Forces',
    'living together': 'Interactions Within the Environment',
    'people and environment': 'Surviving in the Environment',
    'effects of heat': 'Effects of Heat',
  },
  skills: ['Analysing Data', 'Communicating with Evidence', 'Designing Investigations', 'Explaining & Designing', 'Informed Decisions', 'Using Models'],
  competencies: ['Communication', 'Collaboration', 'Information Skills', 'Critical Thinking', 'Adaptive Thinking', 'Inventive Thinking', 'Civic Literacy', 'Global Literacy', 'Cross-Cultural'],

  // Which syllabus chapter a topic label belongs to: an exact name, an alias,
  // then the first keyword match. Unknown labels fall under Interactions' "Thematic".
  chapterOf(label) {
    const t = String(label || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
    const exact = this.chapters.find(c => c.name.toLowerCase() === t); if (exact) return exact;
    const alias = this.aliases[t]; if (alias) return this.chapters.find(c => c.name === alias);
    for (const k of Object.keys(this.aliases)) if (t.includes(k)) return this.chapters.find(c => c.name === this.aliases[k]);
    const raw = String(label || '').toLowerCase();
    return this.chapters.find(c => c.match.test(raw)) || null;
  },
  themeOf(label) { const c = this.chapterOf(label); return this.themes.find(th => th.key === (c ? c.theme : 'Interactions')); },
};
