// The experiment library — Primary 4. Members only.
//
// One record per activity, written in our own words. The MOE activity book is
// the source of WHICH experiments to cover and WHAT each one teaches; none of its
// text, artwork or photographs is reproduced. Diagrams use the app's own shape
// vocabulary (the same one derived questions are drawn with), so the app draws
// every picture itself.
//
// Shape of a record — every field is used by the Lab tab:
//   id, level, chapter, code, title, minutes
//   bigIdea    one sentence the pupil should be able to say at the end
//   aim        what we are trying to find out, in a pupil's words
//   safety     lines shown before the first step that involves heat or glass
//   sim        optional: an interactive version to run on screen
//   parts[]    the experiments, in order. Each has who (adult demo / do it yourself),
//              need[], diagram, and steps[].
//   steps[]    each step is ONE of:
//                { do }                       something to do or watch
//                { predict:{q, options, answer} }   a tap before testing; recorded, never marked
//                { observe:{q, options, answer} }   a tap after testing; recorded, never marked
//                { explain:{q, model, points[], concept} }  a written answer, marked by the
//                                             marker against points[] like any question
//                { note }                     a line of science shown after the step
//   conclude[] fill-in sentences with the words that complete them
//   check[]    short questions marked at the end, with a scheme each
//
// Marks in explain/check follow the marking contract: award the concept,
// never the keyword; heat direction must be stated.

export const LABS = [
{
  id: 'p4-7-3', level: 'P4', chapter: 'Effects of Heat', code: '7.3', minutes: 40, kind: 'lab3d', status: 'ready',
  title: 'Heat gain and heat loss',
  cc21: ['Critical Thinking', 'Communication'],
  skills: ['Analysing Data', 'Communicating with Evidence', 'Using Models'],
  bigIdea: 'When something gains heat it expands. When it loses heat it contracts. Enough heat gain or loss can also change its state.',
  aim: 'Find out what happens to a solid, a liquid and a gas when they gain heat and when they lose heat — and watch ice change state.',
  safety: [
    'Only an adult lights the burner and handles the hot ball and the hot flask. Metal stays hot long after the flame is off.',
    'Goggles on whenever there is a flame or hot water.',
  ],
  // The 3D lab: the Heat Lab page, served from inside the app. The lab page
  // opens it full-screen from "Let's test it now!" and comes back to the steps.
  sim: { page: 'labs/heat/index.html', label: "Let's test it now!", covers: ['a', 'b', 'c'] },
  parts: [
    {
      id: 'a', title: 'A metal ball and a ring', who: 'adult demonstration',
      need: ['a metal ball hanging on a chain', 'a metal ring on a handle', 'a Bunsen burner', 'a basin of tap water'],
      steps: [
        { do: 'Lower the ball through the ring. At room temperature it just fits — only just.' },
        { predict: { q: 'The ball is about to be heated in the flame for two minutes. Will it still pass through the ring?',
          options: ['It will still pass through', 'It will not pass through'], answer: 1 } },
        { do: 'Heat the ball in the flame for two minutes, then try the ring again.' },
        { observe: { q: 'Did the hot ball pass through the ring?', options: ['Yes', 'No'], answer: 1 } },
        { observe: { q: 'When the ball was in the flame, did it gain heat or lose heat?', options: ['Gained heat', 'Lost heat'], answer: 0 } },
        { explain: { q: 'Explain why the hot ball no longer fits through the ring.',
          concept: 'A solid expands when it gains heat.',
          model: 'The metal ball gained heat from the flame and expanded. It became slightly bigger than the hole in the ring, so it could not pass through.',
          points: [ { point: 'the ball gained heat from the flame', marks: 1 }, { point: 'the ball expanded, so it was too big for the ring', marks: 1 } ] } },
        { note: 'The ball grows by less than a hair\'s width. You cannot see the change — the ring is how you know it happened.' },
        { predict: { q: 'The hot ball is lowered into a basin of tap water. Afterwards, will it pass through the ring?',
          options: ['It will', 'It will not'], answer: 0 } },
        { do: 'Lower the hot ball slowly into the water for a minute, lift it out, and try the ring.' },
        { observe: { q: 'Did the cooled ball pass through the ring?', options: ['Yes', 'No'], answer: 0 } },
        { observe: { q: 'In the water, did the ball gain heat or lose heat?', options: ['Gained heat', 'Lost heat'], answer: 1 } },
        { explain: { q: 'Explain why the ball fits through the ring again.',
          concept: 'A solid contracts when it loses heat.',
          model: 'The hot ball lost heat to the cooler water and contracted. It went back to its original size, so it could pass through the ring again.',
          points: [ { point: 'the ball lost heat to the water', marks: 1 }, { point: 'the ball contracted back to its original size', marks: 1 } ] } },
      ],
    },
    {
      id: 'b', title: 'Coloured water in a narrow tube', who: 'adult demonstration',
      need: ['a flask filled to the brim with tap water', 'a few drops of food colouring and a stirrer', 'a stopper with a narrow glass tube through it', 'a marker pen', 'two basins: one of hot water, one of iced water'],
      steps: [
        { do: 'Colour the water so it is easy to see. Fit the stopper and tube tightly — the water rises a little way up the tube. Mark that level.' },
        { predict: { q: 'The flask is about to stand in hot water. Where will the level in the tube end up?',
          options: ['Above the mark', 'Below the mark', 'At the mark'], answer: 0 } },
        { do: 'Stand the flask in the basin of hot water and watch the tube.' },
        { observe: { q: 'Where is the level now?', options: ['Above the mark', 'Below the mark', 'At the mark'], answer: 0 } },
        { explain: { q: 'Explain why the level in the tube rose.',
          concept: 'A liquid expands when it gains heat.',
          model: 'The coloured water gained heat from the hot water and expanded. The flask was already full, so the extra volume had nowhere to go but up the narrow tube, and the level rose above the mark.',
          points: [ { point: 'the water gained heat from the hot water', marks: 1 }, { point: 'the water expanded and rose up the tube', marks: 1 } ] } },
        { note: 'The tube is narrow on purpose. A tiny expansion of all that water becomes a big climb in a thin tube — that is how a thermometer works too.' },
        { predict: { q: 'Now the flask moves to iced water. Where will the level end up?',
          options: ['Above the mark', 'Below the mark', 'At the mark'], answer: 1 } },
        { do: 'Move the flask to the basin of iced water and watch.' },
        { observe: { q: 'Where is the level now?', options: ['Above the mark', 'Below the mark', 'At the mark'], answer: 1 } },
        { explain: { q: 'Explain why the level fell below the mark.',
          concept: 'A liquid contracts when it loses heat.',
          model: 'The coloured water lost heat to the iced water and contracted. It took up less space, so the level in the tube dropped below the mark.',
          points: [ { point: 'the water lost heat to the iced water', marks: 1 }, { point: 'the water contracted and the level fell', marks: 1 } ] } },
      ],
    },
    {
      id: 'c', title: 'A balloon on a flask of air', who: 'adult demonstration',
      need: ['an empty flask (it is full of air)', 'a balloon, stretched over the mouth', 'a Bunsen burner with a stand and gauze', 'a basin of iced water'],
      steps: [
        { predict: { q: 'The flask is about to be warmed over the burner. What will the balloon do?',
          options: ['Blow up', 'Go flatter'], answer: 0 } },
        { do: 'Warm the flask gently over the burner and watch the balloon.' },
        { observe: { q: 'What did the balloon do?', options: ['Blew up', 'Went flatter', 'Nothing'], answer: 0 } },
        { explain: { q: 'Explain what happened to the balloon while the flask was warmed.',
          concept: 'A gas expands when it gains heat — more than a liquid or a solid does.',
          model: 'The air in the flask gained heat from the flame and expanded. The expanding air needed more space, so it pushed into the balloon and blew it up.',
          points: [ { point: 'the air gained heat from the flame', marks: 1 }, { point: 'the air expanded and pushed into the balloon', marks: 1 } ] } },
        { note: 'No air was added. The same air simply takes up more room when it is hot.' },
        { do: 'Turn off the burner and stand the flask in iced water. Watch the balloon.' },
        { observe: { q: 'What did the balloon do?', options: ['Blew up more', 'Went flat, or was pulled inwards'], answer: 1 } },
        { explain: { q: 'Explain what happened to the balloon in the iced water.',
          concept: 'A gas contracts when it loses heat.',
          model: 'The air in the flask lost heat to the iced water and contracted. It took up less space, so the balloon went flat and was pulled towards the flask.',
          points: [ { point: 'the air lost heat to the iced water', marks: 1 }, { point: 'the air contracted, so the balloon went flat', marks: 1 } ] } },
      ],
    },
    {
      id: 'd', title: 'An ice cube on a plate', who: 'do it yourself — at home works',
      need: ['an ice cube', 'a plate', 'a few minutes, then a few days'],
      diagram: { viewBox: '0 0 320 200', shapes: [
        { type:'arc', x1:60, y1:130, x2:260, y2:130, bulge:18 },       // plate
        { type:'line', x1:60, y1:130, x2:260, y2:130 },
        { type:'rect', x:140, y:90, w:40, h:40, fill:'light' },        // ice cube
        { type:'line', x1:110, y1:100, x2:135, y2:108, arrow:true },   // heat arrows in
        { type:'line', x1:210, y1:100, x2:185, y2:108, arrow:true },
        { type:'line', x1:160, y1:55, x2:160, y2:85, arrow:true },
      ], labels: [
        { text:'ice cube', x:230, y:75, leaderTo:[180,95] },
        { text:'plate', x:30, y:170, leaderTo:[80,132] },
        { text:'heat from the warmer air', x:170, y:30, leaderTo:[160,55] },
      ] },
      steps: [
        { observe: { q: 'Put the ice cube on the plate. What state is it in?', options: ['Solid', 'Liquid', 'Gas'], answer: 0 } },
        { do: 'Watch it for two minutes.' },
        { explain: { q: 'Describe the change you saw and explain why it happened.',
          concept: 'A solid melts into a liquid when it gains enough heat.',
          model: 'The ice cube changed from a solid to a liquid. It gained heat from the warmer air and plate around it, so it melted.',
          points: [ { point: 'solid to liquid (melting)', marks: 1 }, { point: 'the ice gained heat from the warmer surroundings', marks: 1 } ] } },
        { observe: { q: 'Which way does the heat flow?', options: ['From the ice into the air', 'From the warmer air and plate into the ice'], answer: 1 } },
        { note: 'Heat always flows from the warmer thing to the cooler thing — here, from the room into the ice.' },
        { predict: { q: 'Leave the plate of water in the room for a few days without touching it. What will you find?',
          options: ['More water', 'The same water', 'Less water, or none'], answer: 2 } },
        { explain: { q: 'After a few days the plate is dry. What happened to the water, and why?',
          concept: 'A liquid evaporates into a gas when it gains heat.',
          model: 'The water gained heat from the surroundings and evaporated. It changed from a liquid to a gas (water vapour) and went into the air, so the plate dried up.',
          points: [ { point: 'the water gained heat from the surroundings', marks: 1 }, { point: 'liquid to gas (evaporation / water vapour)', marks: 1 } ] } },
      ],
    },
  ],
  conclude: [
    { text: 'Heat can make an object ___ or ___.', answers: ['expand', 'contract'] },
    { text: 'When an object ___ heat, it ___.', answers: ['gains', 'expands'] },
    { text: 'When an object ___ heat, it ___.', answers: ['loses', 'contracts'] },
    { text: 'Heat can also change the ___ of matter.', answers: ['state'] },
  ],
  check: [
    { q: 'A metal lid is stuck tight on a glass jar. Ali runs hot water over the lid for a minute and it comes off easily. Explain why.',
      marks: 2, concept: 'A solid expands when it gains heat.',
      model: 'The metal lid gained heat from the hot water and expanded. It became slightly bigger than the mouth of the jar, so it loosened and could be turned.',
      points: [ { point: 'the lid gained heat from the hot water', marks: 1 }, { point: 'the lid expanded and loosened', marks: 1 } ],
      doNotAccept: ['the hot water melted the lid', 'the glass shrank'] },
    { q: 'Overhead power cables are hung with a sag on a cool morning. By the afternoon the sag is bigger. Explain why.',
      marks: 2, concept: 'A solid expands when it gains heat.',
      model: 'The cables gained heat from the hot afternoon sun and expanded, so they became longer and sagged more.',
      points: [ { point: 'the cables gained heat from the sun', marks: 1 }, { point: 'the cables expanded and became longer', marks: 1 } ] },
  ],
},
];

// The rest of the book, mapped and waiting. kind says what each will become:
//   lab3d   an apparatus experiment with a 3D scene, like the Heat Lab
//   observe an observation or sorting activity, with animated 2D diagrams
//   make    something the pupil builds or performs, with a photo of the result
// status runs soon → review → ready. "review" is visible only on a device
// unlocked with the parent code, so every animation is looked over before a
// family can see it. A record without parts shows as coming soon.
//
// Tags use the same vocabulary as the science skillset map:
//   cc21    21st Century Competencies — Critical Thinking, Adaptive Thinking,
//           Inventive Thinking, Communication, Collaboration, Information
//           Skills, Civic Literacy, Global Literacy, Cross-Cultural
//   skills  science practices — Analysing Data, Communicating with Evidence,
//           Using Models, Designing Investigations, Informed Decisions,
//           Explaining & Designing
// No school is named anywhere in these records, in the pages, or in the
// simulations. That is a rule, not a preference.
const SOON = [
  ['1.1', 'Plant System', 'A walk among the plants', 'observe', ['Information Skills'], ['Analysing Data']],
  ['1.2', 'Plant System', 'What each part of a plant does', 'make', ['Communication', 'Inventive Thinking'], ['Using Models', 'Communicating with Evidence']],
  ['1.3', 'Plant System', 'Looking closely at plants', 'observe', ['Information Skills', 'Critical Thinking'], ['Analysing Data']],
  ['1.4', 'Plant System', 'What a plant needs to stay alive', 'observe', ['Critical Thinking', 'Civic Literacy'], ['Designing Investigations', 'Informed Decisions']],
  ['2.1', 'Human Systems', 'The systems inside you', 'observe', ['Information Skills'], ['Using Models']],
  ['2.2', 'Human Systems', 'Where your food goes', 'observe', ['Critical Thinking'], ['Using Models', 'Analysing Data']],
  ['2.3', 'Human Systems', 'What if a part stopped working?', 'observe', ['Critical Thinking', 'Adaptive Thinking'], ['Explaining & Designing']],
  ['2.4', 'Human Systems', 'Build the digestive system', 'make', ['Inventive Thinking', 'Collaboration'], ['Using Models', 'Communicating with Evidence']],
  ['3.1', 'Matter', 'Is it matter?', 'observe', ['Critical Thinking'], ['Analysing Data']],
  ['3.2', 'Matter', 'Solids, liquids and gases side by side', 'observe', ['Critical Thinking', 'Communication'], ['Analysing Data', 'Communicating with Evidence']],
  ['3.3', 'Matter', 'Weighing and measuring things', 'lab3d', ['Information Skills'], ['Analysing Data']],
  ['3.4', 'Matter', 'Plan and run a fair test', 'lab3d', ['Critical Thinking', 'Inventive Thinking'], ['Designing Investigations', 'Analysing Data']],
  ['4.1', 'Light', 'Seeing in the dark', 'lab3d', ['Critical Thinking'], ['Analysing Data', 'Communicating with Evidence']],
  ['5.1', 'Shadows', 'Making shadows', 'lab3d', ['Inventive Thinking'], ['Using Models']],
  ['5.2', 'Shadows', 'Big shadow, small shadow', 'lab3d', ['Critical Thinking'], ['Analysing Data', 'Designing Investigations']],
  ['5.3', 'Shadows', 'Where the shadow falls', 'lab3d', ['Critical Thinking'], ['Analysing Data']],
  ['5.4', 'Shadows', 'The shape of a shadow', 'lab3d', ['Critical Thinking', 'Communication'], ['Analysing Data', 'Communicating with Evidence']],
  ['5.5', 'Shadows', 'Put on a shadow show', 'make', ['Communication', 'Collaboration', 'Inventive Thinking'], ['Using Models']],
  ['6.1', 'Heat', 'Reading a thermometer', 'lab3d', ['Information Skills'], ['Analysing Data']],
  ['6.2', 'Heat', 'Why temperature changes', 'lab3d', ['Critical Thinking'], ['Designing Investigations', 'Analysing Data']],
  ['6.3', 'Heat', 'Heat is not temperature', 'lab3d', ['Critical Thinking', 'Adaptive Thinking'], ['Communicating with Evidence']],
  ['7.1', 'Effects of Heat', 'Heat on the move', 'lab3d', ['Critical Thinking'], ['Using Models', 'Communicating with Evidence']],
  ['7.2', 'Effects of Heat', 'Good and poor conductors', 'lab3d', ['Critical Thinking'], ['Designing Investigations', 'Analysing Data']],
  ['7.4', 'Effects of Heat', 'Keeping things cold', 'lab3d', ['Inventive Thinking', 'Critical Thinking'], ['Designing Investigations', 'Informed Decisions']],
];
SOON.forEach(([code, chapter, title, kind, cc21, skills]) => LABS.push({
  id: 'p4-' + code.replace('.', '-'), level: 'P4', chapter, code, title, kind, status: 'soon', cc21, skills,
}));
LABS.sort((a, b) => parseFloat(a.code) - parseFloat(b.code));
