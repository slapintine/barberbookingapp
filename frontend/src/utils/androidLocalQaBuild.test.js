import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

test("Android local-QA build uses root asset paths for deep routes", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const script = fs.readFileSync(path.join(repoRoot, "scripts", "buildAndroidLocalQa.cjs"), "utf8");

  assert.match(script, /VITE_BASE_PATH:\s*"\/"/);
  assert.doesNotMatch(script, /VITE_BASE_PATH:\s*"\.\/"/);
});

test("Android local-QA build refuses stale external shells", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const script = fs.readFileSync(path.join(repoRoot, "scripts", "buildAndroidLocalQa.cjs"), "utf8");

  assert.match(script, /authoritativeAndroidDir\s*=\s*path\.join\(repoRoot,\s*"android"\)/);
  assert.match(script, /assertAuthoritativeAndroidShell\(androidFrontendDir\)/);
  assert.match(script, /Do not use sibling repositories, preservation snapshots, deleted app copies, or temporary Android shells/);
  assert.doesNotMatch(script, /path\.join\(repoRoot,\s*"\.\.",\s*"barber-booking-app",\s*"frontend"\)/);
  assert.doesNotMatch(script, /QUELESS_ANDROID_FRONTEND_DIR/);
});

test("Android local-QA build packages a manifest for current app verification", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const script = fs.readFileSync(path.join(repoRoot, "scripts", "buildAndroidLocalQa.cjs"), "utf8");
  const sourceDoc = fs.readFileSync(path.join(repoRoot, "ANDROID_AUTHORITATIVE_SOURCE.md"), "utf8");

  assert.match(script, /queless-build-manifest\.json/);
  assert.match(script, /repositoryName:\s*"queless-rc-security"/);
  assert.match(script, /androidSourcePath:\s*"android"/);
  assert.doesNotMatch(script, /repositoryPath:\s*repoRoot/);
  assert.match(script, /"\/smart-match"/);
  assert.match(script, /"\/provider\/ai-coach"/);
  assert.match(script, /"\/provider\/platinum"/);
  assert.match(script, /oldFlowAbsenceChecks/);
  assert.match(script, /noShopRoute/);
  assert.match(script, /noCartRoute/);
  assert.match(sourceDoc, /The active Queless application in this repository is the only current app source/);
  assert.match(sourceDoc, /Temporary Android shells are not authoritative/);
});

test("authoritative Android shell keeps production and local-QA identities separate", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const capacitorConfig = fs.readFileSync(path.join(repoRoot, "android", "capacitor.config.json"), "utf8");
  const buildGradle = fs.readFileSync(path.join(repoRoot, "android", "android", "app", "build.gradle"), "utf8");
  const localQaStrings = fs.readFileSync(
    path.join(repoRoot, "android", "android", "app", "src", "debug", "res", "values", "strings.xml"),
    "utf8"
  );

  assert.match(capacitorConfig, /"appId":\s*"org\.queless\.app"/);
  assert.match(capacitorConfig, /"appName":\s*"Queless"/);
  assert.match(buildGradle, /applicationId\s+"org\.queless\.app"/);
  assert.match(buildGradle, /applicationIdSuffix\s+"\.localqa"/);
  assert.match(buildGradle, /versionCode\s+8/);
  assert.match(buildGradle, /versionName\s+"1\.0\.7"/);
  assert.match(localQaStrings, /Queless Local QA/);
});

test("authoritative Android shell matches the real app system-bar presentation", () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  const styles = fs.readFileSync(
    path.join(repoRoot, "android", "android", "app", "src", "main", "res", "values", "styles.xml"),
    "utf8"
  );
  const mainActivity = fs.readFileSync(
    path.join(repoRoot, "android", "android", "app", "src", "main", "java", "org", "queless", "app", "MainActivity.java"),
    "utf8"
  );
  const appSource = fs.readFileSync(path.join(repoRoot, "frontend", "src", "App.jsx"), "utf8");
  const baseCss = fs.readFileSync(path.join(repoRoot, "frontend", "src", "styles", "base.css"), "utf8");

  assert.match(styles, /<item name="android:statusBarColor">#2B063A<\/item>/);
  assert.match(styles, /<item name="android:navigationBarColor">#24102F<\/item>/);
  assert.match(styles, /<item name="android:windowLightStatusBar">true<\/item>/);
  assert.match(styles, /<item name="android:windowLightNavigationBar">true<\/item>/);
  assert.match(mainActivity, /WindowCompat\.setDecorFitsSystemWindows\(window,\s*true\)/);
  assert.match(mainActivity, /getSupportActionBar\(\)\.hide\(\)/);
  assert.match(mainActivity, /onWindowFocusChanged\(boolean hasFocus\)/);
  assert.match(mainActivity, /FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS/);
  assert.match(mainActivity, /SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN/);
  assert.match(mainActivity, /SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION/);
  assert.match(mainActivity, /window\.setStatusBarColor\(Color\.parseColor\("#2B063A"\)\)/);
  assert.match(mainActivity, /window\.setNavigationBarColor\(Color\.parseColor\("#24102F"\)\)/);
  assert.match(mainActivity, /controller\.setAppearanceLightStatusBars\(true\)/);
  assert.match(mainActivity, /controller\.setAppearanceLightNavigationBars\(true\)/);
  assert.match(appSource, /classList\.toggle\("queless-native-android"/);
  assert.match(baseCss, /html\.queless-native-android body::before/);
  assert.match(baseCss, /--device-safe-bottom:\s*max\(env\(safe-area-inset-bottom,\s*0px\),\s*68px\)/);
  assert.match(baseCss, /padding-top:\s*env\(safe-area-inset-top,\s*0px\)/);
});
