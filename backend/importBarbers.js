const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const db = require("./db");

const filePath = path.join(__dirname, "barbers.csv");

const barbers = [];

console.log("Reading CSV from:", filePath);

fs.createReadStream(filePath)
  .pipe(csv())
  .on("data", (row) => {
    console.log("ROW:", row);
    barbers.push(row);
  })
  .on("end", () => {
    console.log("CSV loaded. Rows found:", barbers.length);

    if (barbers.length === 0) {
      console.log("No rows found in CSV. Nothing to import.");
      process.exit();
    }

    db.serialize(() => {
      const stmt = db.prepare(`
        INSERT INTO barbers
        (business_name, username, location, latitude, longitude, price_from, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      barbers.forEach((b) => {
        stmt.run(
          [
            b.business_name,
            b.username,
            b.location,
            b.latitude ? parseFloat(b.latitude) : null,
            b.longitude ? parseFloat(b.longitude) : null,
            b.price_from ? parseInt(b.price_from, 10) : null,
            b.image_url || "",
          ],
          function (err) {
            if (err) {
              console.log("INSERT ERROR:", err.message);
            } else {
              console.log("Inserted row id:", this.lastID, "for", b.business_name);
            }
          }
        );
      });

      stmt.finalize((err) => {
        if (err) {
          console.log("Finalize error:", err.message);
        } else {
          console.log("Barbers imported successfully.");
        }
        process.exit();
      });
    });
  })
  .on("error", (err) => {
    console.log("CSV read error:", err.message);
    process.exit(1);
  });