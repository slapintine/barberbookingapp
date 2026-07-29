import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(process.cwd(), "..");

test("auth screen submits login from Android keyboard Enter or Go", () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "frontend", "src", "features", "auth", "AuthScreen.jsx"),
    "utf8"
  );

  assert.match(source, /const submitAuthAction = \(\) =>/);
  assert.match(source, /handleLogin\(\{ rememberMe \}\)/);
  assert.match(source, /const handleUsernameKeyDown = \(event\) =>/);
  assert.match(source, /passwordRef\.current\.focus\(\)/);
  assert.match(source, /const handlePasswordKeyDown = \(event\) =>/);
  assert.match(source, /submitAuthAction\(\)/);
  assert.match(source, /enterKeyHint=\{isLogin \? "go"/);
});

test("auth screen keeps the submit action reachable above the Android keyboard", () => {
  const css = fs.readFileSync(
    path.join(repoRoot, "frontend", "src", "styles", "auth-redesign.css"),
    "utf8"
  );

  assert.match(css, /html\.queless-native-android \.app-wrap-v4\.app-auth-v4/);
  assert.match(css, /-webkit-overflow-scrolling:\s*touch/);
  assert.match(css, /padding-bottom:\s*calc\(340px \+ env\(safe-area-inset-bottom,\s*0px\)\)/);
});
