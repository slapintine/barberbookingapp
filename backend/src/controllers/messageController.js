import db from "../config/db.js";
import { sendPushToUser } from "./pushController.js";

function getBarberById(barberId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, owner_user_id, business_name
       FROM barbers
       WHERE id = ?`,
      [barberId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function getUserByUsername(username) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username
       FROM users
       WHERE username = ?`,
      [username],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function getUserById(userId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT id, username
       FROM users
       WHERE id = ?`,
      [userId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      }
    );
  });
}

function ensureMessagesTable() {
  return new Promise((resolve, reject) => {
    db.run(
      `
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barber_id INTEGER NOT NULL,
        customer_user_id INTEGER NOT NULL,
        sender_user_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        seen INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE CASCADE,
        FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
      `,
      [],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function markOldMessageNotificationsRead(userId, barberId, customerUserId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE notifications
       SET read = 1
       WHERE user_id = ?
         AND type = 'message'
         AND read = 0
         AND (
           (barber_id = ? AND customer_user_id = ?)
           OR
           (barber_id IS NULL AND customer_user_id IS NULL)
         )`,
      [userId, barberId, customerUserId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

function addNotification(
  userId,
  {
    title,
    type,
    message,
    barberId = null,
    customerUserId = null,
    customerUsername = "",
    barberOwnerUsername = "",
  }
) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notifications (
        user_id,
        title,
        type,
        message,
        barber_id,
        customer_user_id,
        customer_username,
        barber_owner_username,
        read
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        userId,
        title,
        type,
        message,
        barberId,
        customerUserId,
        customerUsername,
        barberOwnerUsername,
      ],
      function onInsert(err) {
        if (err) reject(err);
        else {
          resolve({
            id: this.lastID,
            user_id: userId,
            title,
            type,
            message,
            barber_id: barberId,
            customer_user_id: customerUserId,
            customer_username: customerUsername,
            barber_owner_username: barberOwnerUsername,
            read: 0,
            createdAt: new Date().toISOString(),
          });
        }
      }
    );
  });
}

export async function sendMessage(req, res, next) {
  try {
    const { barberId, customerUsername, text } = req.body;

    if (!barberId || !customerUsername || !text?.trim()) {
      return res.status(400).json({
        success: false,
        message: "barberId, customerUsername, and text are required.",
      });
    }

    await ensureMessagesTable();

    const barber = await getBarberById(barberId);
    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Barber not found.",
      });
    }

    const customer = await getUserByUsername(customerUsername);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    const barberOwner = await getUserById(barber.owner_user_id);

    const isCustomer = Number(customer.id) === Number(req.user.id);
    const isBarber = Number(barber.owner_user_id) === Number(req.user.id);

    if (!isCustomer && !isBarber) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to message in this conversation.",
      });
    }

    db.run(
      `INSERT INTO messages
       (barber_id, customer_user_id, sender_user_id, text, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [barberId, customer.id, req.user.id, text.trim()],
      async function afterInsert(err) {
        if (err) return next(err);

        try {
          const recipientUserId = isCustomer ? barber.owner_user_id : customer.id;
          const recipient = await getUserById(recipientUserId);

          await markOldMessageNotificationsRead(
            recipientUserId,
            barber.id,
            customer.id
          );

          await addNotification(recipientUserId, {
            title: "New message",
            type: "message",
            message: `${isCustomer ? customer.username : barber.business_name}: ${text.trim()}`,
            barberId: barber.id,
            customerUserId: customer.id,
            customerUsername: customer.username,
            barberOwnerUsername: barberOwner?.username || "",
          });

          if (recipient?.username) {
            await sendPushToUser(recipient.username, {
              title: "New message",
              body: `${barber.business_name}: ${text.trim()}`,
              url: "/",
              tag: `message-${barber.id}-${customer.id}`,
            });
          }

          db.get(
            `SELECT
              m.id,
              m.barber_id AS barberId,
              b.business_name AS barberName,
              bu.username AS barberOwnerUsername,
              m.customer_user_id AS customerUserId,
              cu.username AS customerUsername,
              m.sender_user_id,
              su.username AS sender,
              m.text,
              m.seen,
              m.created_at AS createdAt
             FROM messages m
             JOIN users su ON su.id = m.sender_user_id
             JOIN barbers b ON b.id = m.barber_id
             JOIN users bu ON bu.id = b.owner_user_id
             JOIN users cu ON cu.id = m.customer_user_id
             WHERE m.id = ?`,
            [this.lastID],
            (selectErr, row) => {
              if (selectErr) return next(selectErr);
              return res.status(201).json(row);
            }
          );
        } catch (innerError) {
          return next(innerError);
        }
      }
    );
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const { barberId, customerUsername } = req.query;

    if (!barberId || !customerUsername) {
      return res.status(400).json({
        success: false,
        message: "barberId and customerUsername are required.",
      });
    }

    await ensureMessagesTable();

    const barber = await getBarberById(barberId);
    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Barber not found.",
      });
    }

    const customer = await getUserByUsername(customerUsername);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found.",
      });
    }

    const isCustomer = Number(customer.id) === Number(req.user.id);
    const isBarber = Number(barber.owner_user_id) === Number(req.user.id);

    if (!isCustomer && !isBarber) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view this conversation.",
      });
    }

    db.all(
      `SELECT
        m.id,
        m.barber_id AS barberId,
        b.business_name AS barberName,
        bu.username AS barberOwnerUsername,
        m.customer_user_id AS customerUserId,
        cu.username AS customerUsername,
        m.sender_user_id,
        su.username AS sender,
        m.text,
        m.seen,
        m.created_at AS createdAt
       FROM messages m
       JOIN users su ON su.id = m.sender_user_id
       JOIN barbers b ON b.id = m.barber_id
       JOIN users bu ON bu.id = b.owner_user_id
       JOIN users cu ON cu.id = m.customer_user_id
       WHERE m.barber_id = ?
         AND m.customer_user_id = ?
       ORDER BY m.id ASC`,
      [barberId, customer.id],
      (err, rows) => {
        if (err) return next(err);
        return res.status(200).json(rows || []);
      }
    );
  } catch (error) {
    next(error);
  }
}
