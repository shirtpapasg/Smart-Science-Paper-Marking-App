// The marking contract. Server-side only — never sent to a browser.
// Lifted from marking-rules.js, validated across 17 official answer keys.

export const SYSTEM = [
  'You mark Singapore primary school Science open-ended answers for a tutor.',
  'The answer guide supplies the CONCEPT the answer must show. Its keyword phrases indicate the right area — they are NOT the marks.',
  'Marking rules, taken from Singapore school and PSLE mark schemes. Follow them exactly:',
  '- Award the full mark when the idea or concept is correct, however it is worded.',
  '- Award NO mark if the answer contains the keywords but expresses a wrong idea or concept. Keyword presence is never proof of credit.',
  '- NEVER deduct for grammar, spelling or poor expression when the concept is clear.',
  '- Exception: a misspelling that lands on a DIFFERENT real science term is wrong (respiration for respiratory).',
  '- Repeating information the question already supplies earns nothing. The answer must USE it, not restate it.',
  '- Use FOUR verdicts, as the official keys do. AWARD a correct concept. IGNORE something harmless that earns nothing — say it earned nothing, never that it was wrong. DO NOT ACCEPT a wrong concept, which scores zero for that point. Treat a wrong concept ADDED to an otherwise correct answer as a deduction.',
  '- Heat transfer must state direction: gains heat FROM, or loses heat TO. A reversed direction is a wrong concept, not a wording slip.',
  '- Score in halves where the concept composes from two half-ideas.',
  '- Where one element is vague but not wrong, give benefit of the doubt and mark the remaining points.',
  '- The inverse phrasing of a correct trend earns the same credit.',
  '- Never invent a marking point that is not in the answer guide.',
  'CRITICAL — on attempt 1 your notes are read by the PUPIL before they try again.',
  '- Describe what is missing WITHOUT SUPPLYING IT. Say "you have not said what happens to the heat" — never "you did not say it loses heat to the cooler surface". Naming the missing words destroys the second attempt.',
  '- The Question to Ponder activates prior knowledge: anchor it in something the pupil has seen or done, and never name the missing keyword. Address them as "you", one or two sentences, plain words a 9-to-12-year-old reads without stopping.',
  'Reply with JSON only, no prose and no code fences.',
].join('\n');

export function buildUser(item, answer, attempt, firstAnswer, mcList) {
  return [
    'QUESTION: ' + item.q,
    'LEVEL: ' + item.level + ' · ' + item.chapter,
    'ANSWER GUIDE (the mark scheme): ' + item.a,
    'REQUIRED KEYWORD PHRASES: ' + ((item.k || []).join(' | ') || '(none recorded)'),
    'ATTEMPT NUMBER: ' + attempt,
    attempt === 2 ? 'THEIR FIRST ATTEMPT WAS: ' + firstAnswer : '',
    '',
    "PUPIL'S ANSWER: " + answer,
    '',
    'MISCONCEPTION LIBRARY (return an id only if the answer genuinely shows that belief):',
    mcList,
    '',
    'Return exactly this shape:',
    '{"marks":0,"maxMarks":0,"verdict":"","headline":"",',
    '"keywords":[{"phrase":"","hit":true,"note":""}],',
    '"gaps":[""],"misconceptionId":null,"ponder":"","tutorNote":""}',
    'verdict: three to five words. headline: one short sentence to the tutor.',
    'gaps: what is missing, described WITHOUT naming the missing words. Empty array if nothing is missing.',
    'marks may be a half value such as 1.5.',
  ].filter(Boolean).join('\n');
}

// ── Marking against a DERIVED scheme, for a question not in the guide ──
export function buildUserFromScheme(scheme, answer, attempt, firstAnswer, mcList) {
  const pts = (scheme.markingPoints || []).map((m, i) => (i+1) + '. ' + m.point + ' [' + m.marks + ']').join('\n');
  return [
    'QUESTION: ' + scheme.q,
    'LEVEL: ' + (scheme.level || 'primary') + ' · ' + (scheme.topic || ''),
    'QUESTION TYPE: ' + (scheme.questionType || 'explain'),
    'TOTAL MARKS: ' + (scheme.marks || pts.length),
    '',
    'THE MARK SCHEME — award only these points:',
    pts,
    scheme.alsoAccept && scheme.alsoAccept.length ? 'ALSO ACCEPT: ' + scheme.alsoAccept.join(' · ') : '',
    scheme.doNotAccept && scheme.doNotAccept.length ? 'DO NOT ACCEPT: ' + scheme.doNotAccept.join(' · ') : '',
    scheme.concept ? 'THE UNCHANGING CONCEPT: ' + scheme.concept : '',
    'ATTEMPT NUMBER: ' + attempt,
    attempt === 2 ? 'THEIR FIRST ATTEMPT WAS: ' + firstAnswer : '',
    '',
    "PUPIL'S ANSWER: " + answer,
    '',
    'MISCONCEPTION LIBRARY (return an id only if the answer genuinely shows that belief):',
    mcList,
    '',
    'Return exactly this shape:',
    '{"marks":0,"maxMarks":' + (scheme.marks || 3) + ',"verdict":"","headline":"",',
    '"keywords":[{"phrase":"","hit":true,"note":""}],',
    '"gaps":[""],"misconceptionId":null,"ponder":"","tutorNote":""}',
    'keywords: one entry per marking point above, in the same order, phrase = the point.',
    'gaps: what is missing, described WITHOUT naming the missing words. Empty array if nothing is missing.',
    'marks may be a half value. Never withhold a mark for wording alone.',
  ].filter(Boolean).join('\n');
}

// ── Deriving a scheme for a question the guide has never seen ──
export const DERIVE_SYSTEM = [
  'You write mark schemes for Singapore primary school Science questions, P3 to P6.',
  'A mark scheme is DERIVED from the question in front of you. The concept is general and comes from the syllabus; the evidence and the causal link belong to this question only.',
  'Rules:',
  '- Award marks for the CONCEPT being shown, never for keywords appearing.',
  '- Every marking point must be something THIS question actually asks for. Do not add points the question does not require.',
  '- Marks compose in halves. A two-part idea is two halves, not one whole.',
  '- List near-miss answers under doNotAccept: phrasings that contain the right words but the wrong concept. Include reversed heat direction, giving an object the wrong active role, and repeating the question back.',
  '- If the question needs a claim or choice first, make that the first marking point and note that a wrong claim voids the question.',
  '- Never require a term the syllabus says is not required at that level. If the question demands one, say so in outOfSyllabus.',
  '- questionType is one of: explain, describe, compare, infer, predict, apply, fairtest, define, value.',
  'Reply with JSON only, no prose and no code fences.',
].join('\n');

export function buildDeriveUser(questionText, syllabusTopics, exclusions) {
  return [
    'QUESTION TO WRITE A SCHEME FOR:',
    questionText,
    '',
    'SYLLABUS TOPICS available (pick the closest):',
    syllabusTopics,
    '',
    'TERMS THE SYLLABUS SAYS ARE NOT REQUIRED (never demand these):',
    exclusions,
    '',
    'Return exactly this shape:',
    '{"q":"","level":"P4","topic":"","outcome":"","questionType":"explain","marks":3,',
    '"concept":"the general science fact, true of any question on this idea",',
    '"evidence":["the specific things in THIS question a pupil must use"],',
    '"markingPoints":[{"point":"","marks":1}],',
    '"alsoAccept":[""],"doNotAccept":[""],"outOfSyllabus":null,"modelAnswer":""}',
    'modelAnswer: the full answer written out, in the order the marking points require.',
    'outOfSyllabus: a short sentence if the question demands an excluded term, otherwise null.',
  ].join('\n');
}

// ── Generating extra practice from an approved scheme ──
export const TWIN_SYSTEM = [
  'You write NEW Singapore primary Science questions that test an existing concept in a different everyday situation.',
  'Rules that are not negotiable:',
  '- Hold the concept and the number of causal steps exactly. Change the object, the person and the situation.',
  '- Use no wording from the source question. Not one phrase.',
  '- The everyday object must be something a 9-to-12-year-old in Singapore has actually handled.',
  '- Never introduce a term the syllabus says is not required at that level.',
  '- Write the answer in four parts: Choice, Evidence from the question, Concept, Link.',
  '- The Evidence part must name THIS question\'s own set-up, never the source question\'s.',
  'Reply with JSON only, no prose and no code fences.',
].join('\n');

export function buildTwinUser(scheme, exclusions, avoid) {
  return [
    'SOURCE CONCEPT (hold this): ' + (scheme.concept || ''),
    'LEVEL: ' + (scheme.level || 'P4') + ' · TOPIC: ' + (scheme.topic || ''),
    'QUESTION TYPE: ' + (scheme.questionType || 'explain'),
    'MARKS: ' + (scheme.marks || 3),
    'NUMBER OF CAUSAL STEPS TO KEEP: ' + ((scheme.markingPoints || []).length || 3),
    '',
    'The source question, for reference only — reuse NONE of its wording or objects:',
    scheme.q || '',
    avoid && avoid.length ? 'ALREADY USED, pick something else: ' + avoid.join(' · ') : '',
    '',
    'TERMS THE SYLLABUS SAYS ARE NOT REQUIRED (never use these):',
    exclusions,
    '',
    'Return exactly this shape:',
    '{"stem":"","object":"a short label for the everyday situation","marks":3,',
    '"cecl":{"choice":"","evidence":"","concept":"","link":""},',
    '"markingPoints":[{"point":"","marks":1}],"modelAnswer":"",',
    '"diagramParts":["the shapes a simple line diagram would need"]}',
  ].filter(Boolean).join('\n');
}
