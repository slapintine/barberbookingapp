import db from "../config/db.js";

export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row || null);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export async function transaction(work) {
  if (db.client === "postgres" && typeof db.transaction === "function") {
    return db.transaction(work);
  }

  await run(db.client === "postgres" ? "BEGIN" : "BEGIN IMMEDIATE TRANSACTION");

  try {
    const result = await work({ run, get, all });
    await run("COMMIT");
    return result;
  } catch (error) {
    await run("ROLLBACK").catch(() => {});
    throw error;
  }
}
