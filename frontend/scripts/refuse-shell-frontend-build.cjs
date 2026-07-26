console.error("This Capacitor Android shell must not build its bundled old frontend source.");
console.error("Use the authoritative Queless repository instead:");
console.error("  C:\\Users\\User\\OneDrive\\Documents\\Codex\\2026-04-19-files-mentioned-by-the-user-barber\\queless-rc-security");
console.error("Local QA command:");
console.error("  npm run android:local-qa");
console.error("Production release builds must also copy a verified dist/version.json from the authoritative repository before Capacitor sync.");
process.exit(1);
