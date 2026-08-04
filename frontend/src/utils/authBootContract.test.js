import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("fresh first launch cannot enter the authenticated app from cached profile data alone", () => {
  const app = read("src/App.jsx");

  assert.match(app, /function hasAuthenticatedUserIdentity\(user\)/);
  assert.match(app, /function readStoredAuthUserForBoot\(\)/);
  assert.match(app, /if \(!authToken\) return null/);
  assert.match(app, /const \[currentUser, setCurrentUser\] = useState\(readStoredAuthUserForBoot\)/);
  assert.match(app, /const \[screen, setScreen\] = useState\(\(\) => \(getAuthToken\(\) \? "app" : "login"\)\)/);
});

test("auth boot uses checking, authenticated, and unauthenticated states", () => {
  const app = read("src/App.jsx");

  assert.match(app, /function getAuthBootState\(\{ sessionChecked, token, currentUser \}\)/);
  assert.match(app, /if \(!sessionChecked\) return "checking"/);
  assert.match(app, /return "unauthenticated"/);
  assert.match(app, /const authBootState = getAuthBootState\(\{ sessionChecked, token, currentUser \}\)/);
  assert.match(app, /renderScreen === "checking"/);
  assert.match(app, /Checking your Queless session/);
});

test("malformed or revoked sessions are cleared before protected screens render", () => {
  const app = read("src/App.jsx");

  assert.match(app, /function hasPlausibleProductionAuthToken\(token\)/);
  assert.match(app, /text\.startsWith\("local-"\)/);
  assert.match(app, /!payload\?\.userId \|\| !payload\?\.sessionId \|\| !payload\?\.exp/);
  assert.match(app, /error\?\.status === 401/);
  assert.match(app, /error\?\.status === 403/);
  assert.match(app, /dropToGuest\(\)/);
  assert.match(app, /freshUser = data\?\.user \|\| data/);
  assert.match(app, /hasAuthenticatedUserIdentity\(freshUser\)/);
});

test("protected route and history effects are gated by verified authentication", () => {
  const app = read("src/App.jsx");

  assert.match(app, /if \(screen !== "app" \|\| authBootState !== "authenticated"\) return/);
  assert.match(app, /if \(authBootState === "checking"\) return/);
  assert.match(app, /authBootState === "authenticated"[\s\S]*getScreenFromPath\(window\.location\.pathname, true\)/);
  assert.match(app, /authBootState === "unauthenticated" && screen !== "login"/);
});

test("logout clears auth state and keeps restart on login", () => {
  const app = read("src/App.jsx");

  assert.match(app, /function clearAuthSession\(\)/);
  assert.match(app, /localStorage\.removeItem\("lineup_token"\)/);
  assert.match(app, /sessionStorage\.removeItem\("lineup_user"\)/);
  assert.match(app, /setCurrentUser\(null\)/);
  assert.match(app, /setScreen\("login"\)/);
});

test("production auth boot contract does not introduce demo or placeholder accounts", () => {
  const app = read("src/App.jsx");

  assert.doesNotMatch(app, /Demo User/);
  assert.doesNotMatch(app, /Guest User/);
  assert.doesNotMatch(app, /mockUser/);
  assert.doesNotMatch(app, /currentUser\s*=\s*\{\s*username:\s*["']user["']/);
  assert.doesNotMatch(app, /isAuthenticated:\s*true/);
});
