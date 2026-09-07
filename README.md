# Science Marking — deploy folder

These seven files are everything needed to run the app. Nothing else.

    index.html          the marking page
    api/mark.js         calls the AI. Needs ANTHROPIC_API_KEY set in Vercel
    api/questions.js    the question list, without the answers
    marking-prompt.js   the marking rules
    science-kb.js       247 model answers
    misconceptions.js   42 common mix-ups
    package.json

## Deploy

1. Upload all of this to a new GitHub repo, keeping `api` as a folder.
2. In Vercel: import the repo, framework preset **Other**, no build command.
3. Add environment variable `ANTHROPIC_API_KEY` with your key.
4. Deploy.

The design files, specs and source documents are kept separately. They are
not needed to run the app.
