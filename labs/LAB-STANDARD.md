# Simulation standard

Every experiment in the members' lab follows this. It applies to the labs that
exist (`labs/heat/`, `labs/heat-flow/`) and to every one that comes next. When a
new lab is built in Claude Design, its brief must say these things; when it is
integrated, it must be checked against this list.

## 1. The flow a pupil sees

1. **Predict first.** Every part starts with at least one prediction. The bench
   is closed until a prediction is made.
2. **The button appears beside the prediction.** The moment a pupil picks a
   prediction, a green **"Let's test it now!"** button appears next to it. It
   opens the 3D bench with that part's experiment unlocked.
3. **Test, then answer.** The bench opens as a full-page overlay in the original
   Heat Lab layout, with a "← Back to the steps" bar. The pupil watches, comes
   back, and answers the observation and explanation steps.
4. **Each part unlocks with its own first prediction.** Other parts' benches stay
   greyed with a 🔒 until their prediction is made.
5. **Finish everything to earn the badge.** All parts, the conclusion and the
   real-life questions done → achievement card, rainbow confetti, success sound,
   and the whole lab opens, challenge included.

## 2. The top card (rendered by `lab.html` for every activity with a bench)

- Title: **How to unlock the 3D bench.**
- Text: predict first; the button appears beside the prediction; press it to open
  the bench for that part; come back and answer; each part unlocks with its own
  first prediction.
- A status line under it: "Nothing is open yet…", then "Open so far: …", then the
  badge line.
- **No bench button in the top card.** The only way onto the bench is the button
  beside a prediction.
- **"↺ Start this experiment again"** at the top right, greyed. It wakes only
  after the first prediction has been tested on the bench. The same button also
  sits at the very bottom of the page. Both clear the pupil's predictions,
  observations and answers for that activity; an earned badge stays.

## 3. Locks inside a lab page

- The lab reads `?unlock=` from its URL: a comma-separated list of step ids.
  `intro` is always open. `all` opens everything.
- **No parameter means everything is open.** That is how a lab is previewed on
  its own. A pupil never reaches a lab without a list; `lab.html` always sends
  one.
- Locked pills are greyed (opacity .38, not-allowed cursor) with a 🔒 before the
  label. Moving to a locked step is refused with a short amber line: "That part
  is locked. Finish the steps for it first, then come back."
- **No password, PIN, "teacher unlock", admin badge or hidden override inside a
  lab page.** Anything written in a page can be read by anyone, so it is not a
  lock. The URL list is the only rule.
- **No sign-in or member check inside the lab as delivered.** The member gate is
  added to the page during integration, from the app repo.

## 4. Admin and adult testing

- **Admin login** under the pet buddy (and at the foot of the lab list). Admin
  mode opens every lock, shows activities still in review, enables both reset
  buttons at once, and stays on for that device until logout. Only a fingerprint
  of the password lives in the page.
- A parent code unlocked in the app does the same for that tab.
- New labs go live with `status: 'review'` (visible to admin only) and are set to
  `'ready'` after review.

## 5. Look and feel

- One design system for every lab: the Heat Lab "Science Claw" bundle in `_ds/`,
  same colours, fonts, pill nav, buttons, prediction panel, orbit chip, captions,
  "Turn your phone sideways" screen and Web Audio cues. A pupil who has used one
  lab must feel every other lab is the same place with a different experiment.
- three.js pinned to 0.184.0, loaded the way Heat Lab does.
- On the steps page: question text 19px; the chosen answer gets the rainbow ring.

## 6. Content rules

- Every word is ours. **Nothing copied** from any textbook, activity book or
  worksheet: no text, names, artwork or character names. Reworded, always.
- **No school names, no teacher names**, in any file: page, scene, record,
  questions, answers, comments.
- Model answers and marking points never leave the server. The pupil sees them
  only through marking, after a real attempt, on the second try.
- Every activity carries 21CC tags (`cc21`) and science-skill tags (`skills`).

## 7. The record in `labs-p4.js`

```js
{
  id: 'p4-7-1', code: '7.1', chapter, title, level: 'P4', minutes, kind: 'lab3d',
  status: 'review' | 'ready' | 'soon',
  cc21: [...], skills: [...],
  bigIdea, aim, safety: [...],
  sim: { page: 'labs/<folder>/index.html', label: "Let's test it now!",
         covers: ['a', 'b'],                // parts that have a bench
         map: { a: '<step id>', b: '<step id>' } },  // part → lab step id
  badge: { icon, name, line },
  parts: [ { id, who, title, steps: [ {do}|{predict}|{observe}|{explain}|{note} ] } ],
  conclude: [...], check: [...]
}
```

## 8. Hand-off from Claude Design and integration checklist

Delivered folder: `index.html`, `<name>-scene.js`, `support.js`, `_ds/`. No build
step, everything relative, no network calls apart from fonts and three.js.

On integration:

- [ ] copy into `labs/<folder>/`, add the member gate and `noindex` at the top
- [ ] grep the folder for any password, "teacher", "admin", school names, book text
- [ ] confirm: no `?unlock=` → all pills open; `?unlock=intro,<x>` → the rest 🔒
- [ ] step ids in the page match `sim.map` in the record
- [ ] write the record with `status: 'review'`; check it appears in admin mode
- [ ] run the whole flow once as a pupil: predict → button → bench → answer →
      badge → reset
- [ ] update the second brain
