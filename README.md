# Smart Science Paper Marking — runtime

Everything needed to run the app. Nothing else.

    index.html          the app
    vercel.json         Singapore region, 60s function limit
    package.json

    api/_shared.js      guard() — origin check, rate limit, length caps
    api/mark.js         marks an answer. Needs ANTHROPIC_API_KEY
    api/derive.js       writes a mark scheme for an unseen question
    api/read.js         reads the printed question off a photograph
    api/twin.js         generates extra practice from the context library
    api/questions.js    the question list, without the answers
    api/help.js         answers questions about the app

    marking-prompt.js   the marking rules
    science-kb.js       247 model answers
    context-library.js  approved everyday situations for generated practice
    misconceptions.js   42 common mix-ups
    syllabus-p3p5.js    P3-P6 topics and their exclusions

    chin-*.png liz-*.png cat-*.png   the three buddies

## Deploy

1. Push all of this to the repo, keeping `api` as a folder.
2. Vercel: framework preset **Other**, no build command.
3. Environment variables: `ANTHROPIC_API_KEY`, and `ALLOWED_ORIGIN`
   set to the deployed URL.

## Note

`context-library.js` is required by `api/twin.js`. Without it the twin
endpoint fails at import time — practice generation stops working.

The design files, specs and source documents live separately and are not
needed to run the app.
