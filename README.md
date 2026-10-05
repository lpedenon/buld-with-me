# Buld with me

A local-first AI build workspace for people who want to make ambitious projects and understand the decisions that shape them.

Buld with me lets you compare visual architecture options, discuss a consequential choice, record why you chose it, then continue building with inspectable file proposals and human-run verification.

## Get started

Requirements: Node.js 20.19 or later (or 22.12 or later), npm, and a current Chrome or Edge browser for opening a local project folder. You can try the clearly labeled sample without an AI account.

```sh
npm install
cp .env.example .env.local
```

For live AI, add your OpenAI API key to `.env.local`:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_MODEL=gpt-4.1-mini
```

Then start the local workspace:

```sh
npm run dev
```

Open <http://127.0.0.1:4173>. The server binds to loopback only.

### Try the sample without AI credentials

Set `DEMO_MODE=true` in `.env.local` and restart `npm run dev`. The interface displays a persistent **Sample mode - no live AI** label. Its architecture answers and file preview are fixed synthetic examples; sample changes stay in memory and never touch your files. Sample mode does not call a model.

Do not set `DEMO_MODE=true` when you expect live model responses. Remove it and configure `OPENAI_API_KEY` to use live AI.

## First session

1. Open a project folder in the workspace, or choose the labeled sample in demo mode.
2. Describe the outcome you want. Select only the project files whose contents you want to send as AI context.
3. Compare two architecture options, including a small diagram, concrete example, and tradeoff for each.
4. Select a path, discuss it with the AI, and record the decision locally in your browser. Export a Markdown copy if you want it in your project.
5. Ask the AI to continue. Inspect every proposed file in the before/after preview. Click **Apply this file** only when you approve that exact change.
6. The app reads the changed file back and confirms whether it matches the reviewed proposal. Run any suggested test or command yourself in your project terminal; the app does not execute project code.

## Project access and privacy

- Project folder access uses the browser's File System Access API. The browser asks you to select a folder in read/write mode. Use a current Chrome or Edge browser for this feature.
- The workspace lists supported text-file names locally. It does not send file content until you select a file as context. At most six selected files, each no larger than 40 KB, are sent with a request.
- Common generated folders, `.git`, and `.env*` files are excluded. Do not select files containing credentials, private keys, personal data, or information you do not want to send to OpenAI.
- In live mode, selected goal, project summary, conversation turn, and selected file contents are sent to OpenAI to generate a response. They are not stored by this application. OpenAI's own service terms and retention policies apply.
- The OpenAI key is read by the local server from `.env.local`; it is never sent to the browser. `.env.local` is gitignored.
- Architecture decision notes are stored in this browser's local storage only. They are not uploaded or synchronized. Export a Markdown note when you want a copy in the project.
- File writes require your explicit click for each proposed file. Existing files may only be proposed for editing when you selected them as context. The app never runs project commands. Verification steps are suggestions for you to run and assess yourself.
- The local server accepts loopback requests only and checks request origins. This is a developer tool for a trusted local machine, not a hardened multi-user service.

## Development checks

```sh
npm test
npm run build
```

The project has no app-provided command runner. Suggested commands are presented for you to run manually, not executed or reported as passed by the AI.

## Current limits

This first slice supports the OpenAI API in live mode. Architecture responses are structured as two options; the AI may still be wrong, so inspect the choices. Project context and conversation are sent to OpenAI only in live mode. Local file access depends on browser support. The workspace does not execute project tests, create a hosted account, sync decisions, or place financial trades.
