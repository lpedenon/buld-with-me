import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

process.env.DEMO_MODE = "true";
const { app, isSafeRelativePath } = await import("./index.ts");
let server: Server;
let baseUrl = "";

before(async () => {
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("safe context paths reject traversal and credential files", () => {
  assert.equal(isSafeRelativePath("src/components/App.tsx"), true);
  assert.equal(isSafeRelativePath("../outside.txt"), false);
  assert.equal(isSafeRelativePath("src/../../outside.txt"), false);
  assert.equal(isSafeRelativePath("/absolute/path"), false);
  assert.equal(isSafeRelativePath(".env.local"), false);
  assert.equal(isSafeRelativePath("node_modules/package/index.js"), false);
  assert.equal(isSafeRelativePath("src\\secret.txt"), false);
});

test("status distinguishes the fixed sample demo from live AI", async () => {
  const response = await fetch(`${baseUrl}/api/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { mode: "demo", model: null });
});

test("architecture route returns two explicitly labeled sample paths without AI calls", async () => {
  const response = await fetch(`${baseUrl}/api/architecture`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      goal: "Build a small reading list and learn how its architecture works.",
      projectName: "Reading list sample",
      projectSummary: "A synthetic sample app.",
      knownFiles: ["README.md"],
      context: [{ path: "README.md", content: "# Reading list" }],
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as { mode: string; options: unknown[] };
  assert.equal(result.mode, "demo");
  assert.equal(result.options.length, 2);
});

test("discussion responses cannot return file changes before a choice is recorded", async () => {
  const response = await fetch(`${baseUrl}/api/continue`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      goal: "Build a small reading list and learn how its architecture works.",
      projectName: "Reading list sample",
      knownFiles: ["README.md"],
      context: [{ path: "README.md", content: "# Reading list" }],
      option: { id: "simple", title: "One app", summary: "Small", tradeoff: "Less split" },
      history: [],
      message: "Could a mobile client be added later?",
      stage: "discuss",
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as { mode: string; files: unknown[]; verification: unknown[] };
  assert.equal(result.mode, "demo");
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.verification, []);
});

test("API refuses foreign origins and unsafe context paths", async () => {
  const foreign = await fetch(`${baseUrl}/api/status`, { headers: { origin: "https://attacker.example" } });
  assert.equal(foreign.status, 403);
  const unsafe = await fetch(`${baseUrl}/api/architecture`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      goal: "Build a small reading list and learn how its architecture works.",
      projectName: "Reading list sample",
      context: [{ path: "../../private-key.pem", content: "not a real key" }],
    }),
  });
  assert.equal(unsafe.status, 400);
});

test("sample continuation returns a synthetic preview and no verification claim", async () => {
  const response = await fetch(`${baseUrl}/api/continue`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: baseUrl },
    body: JSON.stringify({
      goal: "Build a small reading list and learn how its architecture works.",
      projectName: "Reading list sample",
      knownFiles: ["README.md"],
      context: [{ path: "README.md", content: "# Reading list" }],
      option: { id: "simple", title: "One app", summary: "Small", tradeoff: "Less split" },
      history: [{ role: "user", content: "How would this help?" }],
      message: "Show me one small change.",
      stage: "build",
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json() as { mode: string; files: { path: string }[]; verification: { command: string }[] };
  assert.equal(result.mode, "demo");
  assert.equal(result.files[0]?.path, "README.md");
  assert.equal(result.verification[0]?.command, "Manual check");
});
