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
  // covers: which parts the lab serves; map: which tab in the lab each part
  // unlocks once its predictions are made. Everything unlocks with the badge.
  sim: { page: 'labs/heat/index.html', label: "Let's test it now!", covers: ['a', 'b', 'c'], map: { a: 'solid', b: 'liquid', c: 'gas' } },
  badge: { icon: '🔥', name: 'Heat Explorer', line: 'You watched a solid, a liquid and a gas expand and contract, and explained every one.' },
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
{
  id: 'p4-7-1', level: 'P4', chapter: 'Effects of Heat', code: '7.1', minutes: 35, kind: 'lab3d', status: 'review',
  title: 'Heat on the move',
  cc21: ['Critical Thinking', 'Communication'],
  skills: ['Analysing Data', 'Using Models', 'Communicating with Evidence'],
  bigIdea: 'Heat flows from the hotter thing to the colder thing, and keeps flowing until both are the same temperature. A source of heat is anything hotter than its surroundings.',
  aim: 'Watch heat move from hot water to cold water with two thermometers, then work out when a warm pie counts as a source of heat and when it does not.',
  safety: [
    'Water at 50 °C is hot enough to scald. An adult pours it and moves the cup.',
    'Keep the data logger and its wires away from the water.',
  ],
  sim: { page: 'labs/heat-flow/index.html', label: "Let's test it now!", covers: ['a', 'b'], map: { a: 'flow', b: 'source' } },
  badge: { icon: '🌡️', name: 'Heat Tracker', line: 'You followed heat from hot to cold until it stopped, and worked out what makes something a source of heat.' },
  parts: [
    {
      id: 'a', title: 'Hot cup, cool water', who: 'adult demonstration',
      need: ['a plastic tub of cool water (about 20 °C)', 'a small cup of hot water (about 50 °C) standing in the tub', 'two probe thermometers on a data logger, one in the cup and one in the tub', 'a clock'],
      steps: [
        { do: 'Stand the cup of hot water in the tub of cool water. Put one probe in the cup and one in the tub. Read both.' },
        { predict: { q: 'Twenty minutes from now, what will the two thermometers show?',
          options: ['Cup cooler, tub warmer, both about the same', 'Cup the same, tub warmer', 'Both exactly as they started'], answer: 0 } },
        { do: 'Read both thermometers every five minutes for thirty minutes. Watch which way each one moves.' },
        { observe: { q: 'From 0 to 20 minutes, what happened to the water in the cup?', options: ['Its temperature fell', 'Its temperature rose', 'It stayed the same'], answer: 0 } },
        { observe: { q: 'From 0 to 20 minutes, what happened to the water in the tub?', options: ['Its temperature fell', 'Its temperature rose', 'It stayed the same'], answer: 1 } },
        { observe: { q: 'From 20 to 30 minutes, what did the two readings do?', options: ['Kept moving apart', 'Stayed about the same, close together', 'Swapped over'], answer: 1 } },
        { explain: { q: 'Explain how heat moved between the water in the cup and the water in the tub, and why it stopped.',
          concept: 'Heat flows from a hotter object to a colder one until both reach the same temperature.',
          model: 'The water in the cup was hotter than the water in the tub, so heat flowed from the cup water to the tub water. The cup water lost heat and its temperature fell; the tub water gained heat and its temperature rose. Heat kept flowing until both were at the same temperature, and then it stopped.',
          points: [ { point: 'heat flowed from the hotter cup water to the colder tub water', marks: 1 }, { point: 'the cup lost heat and cooled while the tub gained heat and warmed', marks: 1 }, { point: 'the flow stopped when both reached the same temperature', marks: 1 } ],
          doNotAccept: ['cold flowed from the tub into the cup', 'the cup and tub shared their temperature'] } },
        { note: 'Heat only ever moves one way: from hotter to colder. When there is no difference left, there is nothing to move.' },
      ],
    },
    {
      id: 'b', title: 'Is a warm pie a source of heat?', who: 'think it through, then test on the bench',
      need: ['a warm pie, or any warm object', 'three places to imagine it: a table, a fridge, a hot oven'],
      steps: [
        { do: 'Two friends disagree. One says a warm pie is always a source of heat. The other says it depends on what is around it.' },
        { predict: { q: 'Who is right?', options: ['A warm pie is always a source of heat', 'It depends on what is around the pie'], answer: 1 } },
        { do: 'On the bench, move the pie from the table to the fridge to the hot oven and watch which way the heat goes each time.' },
        { observe: { q: 'On the table (about 25 °C), which way does heat go?', options: ['Out of the pie into the room', 'From the room into the pie', 'Nowhere'], answer: 0 } },
        { observe: { q: 'In a hot oven (about 180 °C), which way does heat go?', options: ['Out of the pie into the oven', 'From the oven into the pie', 'Nowhere'], answer: 1 } },
        { explain: { q: 'Is the warm pie a source of heat on the table? Is it a source of heat in the hot oven? Explain both.',
          concept: 'A source of heat is an object with a higher temperature than its surroundings.',
          model: 'On the table the pie is hotter than the air around it, so heat flows out of the pie into the surroundings and the pie is a source of heat. In the hot oven the oven is hotter than the pie, so heat flows from the oven into the pie and the pie is not a source of heat there.',
          points: [ { point: 'on the table the pie is hotter than its surroundings, so heat flows out of it: a source of heat', marks: 1 }, { point: 'in the oven the surroundings are hotter, so heat flows into the pie: not a source of heat', marks: 1 } ] } },
        { note: 'Being a source of heat is not about being warm. It is about being warmer than whatever is around you.' },
      ],
    },
  ],
  conclude: [
    { text: 'Heat flows between two touching objects when there is a ___ in their temperatures.', answers: ['difference'] },
    { text: 'Heat flows from the ___ object to the ___ object until both reach the ___ temperature.', answers: ['hotter', 'colder', 'same'] },
    { text: 'A source of heat has a temperature ___ than its surroundings.', answers: ['higher'] },
    { text: 'Two everyday sources of heat are the ___ and a ___.', answers: ['sun', 'stove'] },
  ],
  check: [
    { q: 'Meili leaves a metal spoon in a bowl of hot soup. After a minute the handle feels hot. Explain how the handle became hot.',
      marks: 2, concept: 'Heat flows from a hotter object to a colder one.',
      model: 'The soup was hotter than the spoon, so heat flowed from the hot soup into the spoon and along it to the handle. The handle gained heat and its temperature rose.',
      points: [ { point: 'heat flowed from the hotter soup into the spoon', marks: 1 }, { point: 'the handle gained heat, so its temperature rose', marks: 1 } ],
      doNotAccept: ['the cold from the spoon went into the soup'] },
    { q: 'An ice pack is placed on a bruised knee. Explain why the knee feels cold.',
      marks: 2, concept: 'Heat flows from a hotter object to a colder one.',
      model: 'The knee is hotter than the ice pack, so heat flows from the knee into the ice pack. The knee loses heat and its temperature falls, which is what we feel as cold.',
      points: [ { point: 'heat flows from the warmer knee into the colder ice pack', marks: 1 }, { point: 'the knee loses heat and its temperature falls', marks: 1 } ],
      doNotAccept: ['coldness flows from the ice pack into the knee'] },
  ],
},
{
  id: 'p4-7-2', level: 'P4', chapter: 'Effects of Heat', code: '7.2', minutes: 45, kind: 'lab3d', status: 'review',
  title: 'Good and poor conductors',
  cc21: ['Critical Thinking', 'Adaptive Thinking'],
  skills: ['Designing Investigations', 'Analysing Data', 'Informed Decisions'],
  bigIdea: 'A good conductor lets heat pass through it quickly, so it gains and loses heat quickly. A poor conductor lets heat through slowly. Metal is a good conductor; foam, plastic and wood are poor conductors.',
  aim: 'Race a metal cup against a foam cup at keeping water hot, then cold; feel two blocks and measure them; then race two ice cubes. Work out what a good conductor does.',
  safety: [
    'Water at 60 °C can scald. An adult pours it and moves the cups.',
    'Keep the data logger and its wires away from the water.',
    'Ice is slippery on a bench. Wipe up puddles as they form.',
  ],
  sim: { page: 'labs/conductor/index.html', label: "Let's test it now!", covers: ['a', 'b', 'c', 'd'],
         map: { a: 'hot', b: 'cold', c: { page: 'labs/heat/index.html', step: 'feel' }, d: 'ice' } },
  badge: { icon: '🥄', name: 'Conductor Detective', line: 'You found out which materials let heat through quickly, which slow it down, and why your hand is not a thermometer.' },
  parts: [
    {
      id: 'a', title: 'Keep it hot', who: 'adult demonstration',
      need: ['a tub of room-temperature water (about 25 °C)', 'a metal cup and a foam cup of the same size, each with a lid', 'hot water (about 60 °C) to fill both cups', 'two probe thermometers on a data logger, one through each lid', 'a clock'],
      steps: [
        { do: 'Fill both cups with the same hot water. Stand them side by side in the tub. Put a probe through each lid and read both.' },
        { predict: { q: 'Which cup will keep the water hot for longer?', options: ['The metal cup', 'The foam cup', 'Both the same'], answer: 1 } },
        { do: 'Read both thermometers every five minutes for fifteen minutes. Watch the graph as it draws.' },
        { observe: { q: 'After fifteen minutes, which cup held the hotter water?', options: ['The metal cup', 'The foam cup', 'Both the same'], answer: 1 } },
        { observe: { q: 'Which reading dropped fastest in the first five minutes?', options: ['The metal cup', 'The foam cup', 'They dropped at the same speed'], answer: 0 } },
        { explain: { q: 'Explain why the water in the foam cup stayed hot for longer than the water in the metal cup.',
          concept: 'A good conductor lets heat pass through it quickly; a poor conductor lets heat pass through slowly.',
          model: 'The hot water in both cups lost heat to the cooler water in the tub. Metal is a good conductor, so heat passed through the metal wall quickly and that water cooled fast. Foam is a poor conductor, so heat passed through the foam wall slowly and that water stayed hot for longer.',
          points: [ { point: 'heat flowed from the hot water in the cups to the cooler tub water', marks: 1 }, { point: 'metal is a good conductor, so heat passed through it quickly and the water cooled fast', marks: 1 }, { point: 'foam is a poor conductor, so heat passed through it slowly and the water stayed hot longer', marks: 1 } ],
          doNotAccept: ['the foam cup made heat', 'the foam kept the cold out', 'the metal cup was colder to begin with'] } },
        { note: 'A cup does not make heat or hold it like a bucket. It only controls how fast heat gets through its wall.' },
      ],
    },
    {
      id: 'b', title: 'Keep it cold', who: 'adult demonstration',
      need: ['the same tub of room-temperature water', 'the same two cups, now filled with iced water (about 6 °C)', 'the two probes and the data logger', 'a clock'],
      steps: [
        { do: 'Empty and refill both cups with iced water. Stand them in the tub again and read both.' },
        { predict: { q: 'Which cup will keep the water cold for longer?', options: ['The metal cup', 'The foam cup', 'Both the same'], answer: 1 } },
        { do: 'Read both thermometers every five minutes for fifteen minutes. Notice which way the glowing motes move on the bench this time.' },
        { observe: { q: 'After fifteen minutes, which cup held the warmer water?', options: ['The metal cup', 'The foam cup', 'Both the same'], answer: 0 } },
        { observe: { q: 'Which way did heat flow this time?', options: ['From the tub water into the cups', 'From the cups into the tub water', 'Heat did not flow'], answer: 0 } },
        { explain: { q: 'A foam cup keeps a drink hot and also keeps a drink cold. Explain how one material can do both.',
          concept: 'A poor conductor slows the flow of heat in both directions.',
          model: 'Foam is a poor conductor, so heat passes through it slowly whichever way it is going. With a hot drink, heat leaves the drink slowly, so it stays hot. With a cold drink, heat from the warmer surroundings enters slowly, so it stays cold.',
          points: [ { point: 'foam is a poor conductor, so heat passes through it slowly in either direction', marks: 1 }, { point: 'a hot drink loses heat slowly; a cold drink gains heat from outside slowly', marks: 1 } ],
          doNotAccept: ['foam makes cold', 'foam keeps the cold in', 'foam stores heat'] } },
        { note: 'Nothing makes cold. Something feels cold or stays cold when heat is slow to reach it.' },
      ],
    },
    {
      id: 'c', title: 'Feel it, then measure it', who: 'hands on',
      need: ['a metal block and a wooden block left in the same room for an hour', 'a thermometer or a thermo gun', 'your hand'],
      steps: [
        { do: 'Both blocks have been sitting in the same room all morning. Do not touch them yet.' },
        { predict: { q: 'Which block will feel colder to your hand?', options: ['The metal block', 'The wooden block', 'They will feel the same'], answer: 0 } },
        { do: 'On the bench, touch each block with the hand tool. Then measure each one with the thermo gun.' },
        { observe: { q: 'What did the thermo gun show?', options: ['Both blocks at about the same temperature', 'The metal block much colder', 'The wooden block much colder'], answer: 0 } },
        { explain: { q: 'The two blocks are at the same temperature, yet the metal one feels colder. Explain why.',
          concept: 'Your hand senses how quickly heat leaves it, not temperature. A good conductor takes heat from your hand quickly.',
          model: 'Your hand is warmer than both blocks, so heat flows from your hand into each block. Metal is a good conductor, so it takes heat from your skin quickly and your hand feels cold. Wood is a poor conductor, so heat leaves your hand slowly and it feels warmer. Only a thermometer measures temperature.',
          points: [ { point: 'the hand is warmer than the blocks, so heat flows from the hand into each block', marks: 1 }, { point: 'metal is a good conductor and takes heat from the skin quickly, which feels cold; wood takes it slowly', marks: 1 } ],
          doNotAccept: ['the metal block is colder', 'cold flows from the metal into the hand', 'wood makes its own heat'] } },
        { note: 'Your hand is a heat-flow meter, not a thermometer. It tells you how fast heat is leaving, not how hot something is.' },
      ],
    },
    {
      id: 'd', title: 'The melting race', who: 'hands on, with an adult',
      need: ['the metal block and a foam block', 'two rubber rings, one on each block', 'two ice cubes of the same size', 'a stopwatch'],
      steps: [
        { do: 'Put a rubber ring on each block. Drop one ice cube inside each ring at the same moment and start the stopwatch.' },
        { predict: { q: 'Which ice cube will melt first?', options: ['The one on the metal block', 'The one on the foam block', 'Both at the same time'], answer: 0 } },
        { do: 'On the bench, press Start and watch the two cubes and the two puddles.' },
        { observe: { q: 'Which cube was gone first?', options: ['The one on the metal block', 'The one on the foam block', 'They finished together'], answer: 0 } },
        { observe: { q: 'Where did the heat that melted the ice come from?', options: ['From the warm room, through the block, into the ice', 'From inside the ice cube', 'From the rubber ring'], answer: 0 } },
        { explain: { q: 'Explain why the ice cube on the metal block melted first.',
          concept: 'A good conductor passes heat quickly; heat flows from the warmer surroundings into the colder ice.',
          model: 'The room and the blocks were warmer than the ice, so heat flowed from them into the ice. Metal is a good conductor, so it passed heat from the room into its ice cube quickly and that cube melted first. Foam is a poor conductor, so heat reached its ice cube slowly.',
          points: [ { point: 'heat flowed from the warmer room and block into the colder ice', marks: 1 }, { point: 'metal is a good conductor and passed heat quickly, so its cube melted first; foam passed heat slowly', marks: 1 } ],
          doNotAccept: ['the metal block was hotter than the foam block', 'the metal block made heat', 'the foam block kept the cold in'] } },
        { note: 'Both blocks were at the same temperature. Only the speed of the heat flow was different.' },
      ],
    },
  ],
  conclude: [
    { text: 'A ___ conductor lets heat pass through it quickly.', answers: ['good'] },
    { text: 'A poor conductor lets heat pass through it ___.', answers: ['slowly'] },
    { text: 'Metal is a ___ conductor of heat; foam, plastic and wood are ___ conductors.', answers: ['good', 'poor'] },
    { text: 'Your hand feels how ___ heat moves, but only a ___ measures temperature.', answers: ['fast', 'thermometer'] },
  ],
  check: [
    { q: 'A saucepan is made of metal, but its handle is made of plastic. Explain both choices.',
      marks: 2, concept: 'We use good conductors where we want heat to move and poor conductors where we want heat to stay away.',
      model: 'Metal is a good conductor, so heat from the stove passes quickly through the pan into the food. Plastic is a poor conductor, so heat from the pan passes only slowly into the handle and your hand does not get burnt.',
      points: [ { point: 'the metal pan is a good conductor, so heat passes quickly into the food', marks: 1 }, { point: 'the plastic handle is a poor conductor, so heat reaches the hand slowly', marks: 1 } ],
      doNotAccept: ['plastic keeps the heat in', 'plastic makes the handle cold'] },
    { q: 'Ice cream is carried home in a foam box. Explain why it stays frozen for longer than it would in a metal tin.',
      marks: 2, concept: 'A poor conductor slows the flow of heat from warmer surroundings into a colder object.',
      model: 'The air outside is warmer than the ice cream, so heat flows from the air into the ice cream. Foam is a poor conductor, so heat passes through the box slowly and the ice cream gains heat slowly. Metal is a good conductor, so heat would pass through a tin quickly and the ice cream would melt sooner.',
      points: [ { point: 'heat flows from the warmer air into the colder ice cream', marks: 1 }, { point: 'foam is a poor conductor so heat enters slowly; metal would let it in quickly', marks: 1 } ],
      doNotAccept: ['the foam keeps the cold in', 'the foam makes cold'] },
  ],
},
];
// The rest of the book, mapped and waiting. kind says what each will become:
//   lab3d   an apparatus experiment with a 3D scene, like the Heat Lab
//   observe an observation or sorting activity, with animated 2D diagrams
//   make    something the pupil builds or performs, with a photo of the result
// status runs soon → review → ready. "review" is visible only in admin mode
// (Admin login under the buddy) or to an adult who has unlocked the parent
// code, so every animation is looked over before a family can see it. A record without parts shows as coming soon.
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
  ['7.4', 'Effects of Heat', 'Keeping things cold', 'lab3d', ['Inventive Thinking', 'Critical Thinking'], ['Designing Investigations', 'Informed Decisions']],
];
SOON.forEach(([code, chapter, title, kind, cc21, skills]) => LABS.push({
  id: 'p4-' + code.replace('.', '-'), level: 'P4', chapter, code, title, kind, status: 'soon', cc21, skills,
}));
LABS.sort((a, b) => parseFloat(a.code) - parseFloat(b.code));
