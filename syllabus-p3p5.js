// MOE Primary Science syllabus (2023, updated May 2024) — P3–P6 scope, as tagging vocabulary.
// Source: uploads/NEW_Primary Science Syllabus 2023_May24.pdf, Section 5 Syllabus Learning Outcomes.
// `excludes` are the syllabus's own "not required" notes — used to flag out-of-scope questions.

export const THEMES = ["Diversity", "Cycles", "Systems", "Interactions", "Energy"];

export const TOPICS = [
  { theme: "Diversity", topic: "Diversity of Living and Non-Living Things (General characteristics and classification)", levels: ["P3"],
    outcomes: ["Describe the characteristics of living things", "Recognise broad groups of living things based on similarities and differences"],
    excludes: ["Recall of names of specific living things and their characteristics is not required"] },
  { theme: "Diversity", topic: "Diversity of Materials", levels: ["P3"],
    outcomes: ["Relate the use of various materials to their physical properties", "Compare physical properties of materials"],
    excludes: ["The concept of density is not required", "The terms transparent / translucent / opaque are not required"] },
  { theme: "Cycles", topic: "Cycles in Plants and Animals (Life Cycles)", levels: ["P3"],
    outcomes: ["Show an understanding that different living things have different life cycles"], excludes: [] },
  { theme: "Cycles", topic: "Cycles in Plants and Animals (Reproduction)", levels: ["P5 Standard", "P5 Foundation"],
    outcomes: ["Recognise that a cell is a basic unit of life", "Describe processes in the sexual reproduction of flowering plants", "Recognise the process of fertilisation in humans"],
    excludes: ["Vegetative propagation methods such as stem cutting are not required", "Knowledge of pollen tube formation is not required", "Self-pollination / cross-pollination terms are not required", "Foetal development and the umbilical cord mechanism are not required"] },
  { theme: "Cycles", topic: "Cycles in Matter and Water (Matter)", levels: ["P4"],
    outcomes: ["State that matter is anything that has mass and occupies space", "Differentiate among the three states of matter in terms of shape and volume"], excludes: [] },
  { theme: "Cycles", topic: "Cycles in Matter and Water (Water)", levels: ["P5 Standard", "P5 Foundation"], outcomes: ["Describe the water cycle"], excludes: [] },
  { theme: "Systems", topic: "Human System (Digestive System)", levels: ["P4"], outcomes: ["Identify the parts of the human digestive system and their functions"],
    excludes: ["Other organs in the body and descriptions of how they work are not required"] },
  { theme: "Systems", topic: "Human System (Respiratory and circulatory systems)", levels: ["P5 Standard", "P5 Foundation"], outcomes: ["Identify the parts and functions of the respiratory and circulatory systems"], excludes: [] },
  { theme: "Systems", topic: "Plant System (Plant parts and functions)", levels: ["P4"], outcomes: ["Identify the parts of a plant and their functions"],
    excludes: ["The terms xylem and phloem are not required"] },
  { theme: "Systems", topic: "Plant System (Respiratory and circulatory systems)", levels: ["P5 Standard", "P5 Foundation"], outcomes: ["Recognise transport of water and food in plants"],
    excludes: ["The terms xylem and phloem are not required"] },
  { theme: "Systems", topic: "Electrical System", levels: ["P5 Standard", "P5 Foundation"], outcomes: ["Identify the components of a simple circuit", "Compare series and parallel circuits"], excludes: [] },
  { theme: "Interactions", topic: "Interaction of Forces (Magnets)", levels: ["P3"], outcomes: ["Describe the properties of magnets", "Recognise magnetic and non-magnetic materials"],
    excludes: ["Recall of magnetic materials such as nickel and cobalt is not required", "Magnetic shielding and magnetic induction are not required"] },
  { theme: "Energy", topic: "Energy Forms and Uses (Light)", levels: ["P4"], outcomes: ["Recognise that light travels in a straight line", "Describe how shadows are formed", "Recognise reflection of light"],
    excludes: ["The law of reflection is not required", "The terms transparent / translucent / opaque are not required"] },
  { theme: "Energy", topic: "Energy Forms and Uses (Heat)", levels: ["P4"],
    outcomes: ["State that heat is a form of energy", "Differentiate between heat and temperature", "Show an understanding that heat flows from a hotter to a colder object until both reach the same temperature", "Relate the change in temperature of an object to gain or loss of heat", "List effects of heat gain/loss (contraction / expansion, change in state)", "Identify good and poor conductors of heat"],
    excludes: ["Recall of the rate of heat transfer of specific materials (such as different types of metals) is not required"] },
  { theme: "Interactions", topic: "Interaction of Forces (Frictional force, gravitational force, elastic spring force)", levels: ["P6 Standard", "P6 Foundation"],
    outcomes: ["Recognise the effects of a force", "Describe frictional force and how it can be reduced", "Describe gravitational force and weight", "Describe elastic spring force (Standard only)"],
    excludes: ["Elastic spring force is not required for P6 Foundation"] },
  { theme: "Interactions", topic: "Interactions within the Environment", levels: ["P6 Standard", "P6 Foundation"],
    outcomes: ["Recognise habitats, populations and communities", "Describe food chains and food webs", "Recognise adaptations for survival", "Describe man's impact on the environment"], excludes: [] },
  { theme: "Energy", topic: "Energy Forms and Uses (Photosynthesis)", levels: ["P6 Standard", "P6 Foundation"],
    outcomes: ["Recognise that the Sun is our primary source of energy", "Investigate the requirements for photosynthesis (water, light energy, carbon dioxide)", "Recognise that living things need energy from respiration (Standard only)"],
    excludes: ["The focus of respiration is on the release of energy from food"] },
  { theme: "Energy", topic: "Energy Conversion", levels: ["P6 Standard"],
    outcomes: ["Recognise and give examples of the various forms of energy", "Investigate energy conversion from one form to another"],
    excludes: ["The specific terms chemical potential, gravitational potential and elastic potential energy are not required"] },
];

// NOTE: the tutor's range is P3–P6. There is no out-of-level rejection — a pupil may
// legitimately practise a P6-examined question built on P4 content, which is what the
// whole PSLE topical corpus is. The only hard boundary is the `excludes` list above:
// terms the syllabus states are NOT required. "Not yet taught to this class" is a note,
// never a rejection.
export const OUT_OF_SYLLABUS_ONLY = true;

// Foundation-track note: underlined syllabus topics are not required for Foundation Science.
export const QUESTION_SKILLS = ["State", "Describe", "Explain", "Compare", "Infer", "Predict", "Investigate / plan"];
