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

async function ensureMessagesTable() {
  await dbRun(
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
    `
  );

  if (db.client === "sqlite") {
    const columns = await dbAll("PRAGMA table_info(messages)");
    const columnNames = new Set(columns.map((column) => column.name));
    if (!columnNames.has("seen")) {
      await dbRun("ALTER TABLE messages ADD COLUMN seen INTEGER NOT NULL DEFAULT 0");
    }
    return;
  }

  await dbRun("ALTER TABLE messages ADD COLUMN IF NOT EXISTS seen INTEGER DEFAULT 0").catch(() => {});
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function conversationIdFor(row = {}) {
  return `${row.barberId}:${row.customerUsername}`;
}

function parseConversationId(conversationId = "") {
  const [barberId, ...usernameParts] = String(conversationId || "").split(":");
  return {
    barberId,
    customerUsername: usernameParts.join(":"),
  };
}

function serializeMessage(row = {}) {
  return {
    id: row.id,
    conversationId: conversationIdFor(row),
    conversation_id: conversationIdFor(row),
    barberId: row.barberId,
    barber_id: row.barberId,
    barberName: row.barberName,
    barber_name: row.barberName,
    barberOwnerUsername: row.barberOwnerUsername,
    customerUserId: row.customerUserId,
    customer_user_id: row.customerUserId,
    customerUsername: row.customerUsername,
    customer_username: row.customerUsername,
    senderId: row.sender_user_id,
    sender_id: row.sender_user_id,
    sender_user_id: row.sender_user_id,
    sender: row.sender,
    senderUser: {
      id: row.sender_user_id,
      username: row.sender,
      fullName: row.sender,
    },
    body: row.text,
    text: row.text,
    seen: Boolean(row.seen),
    readAt: row.seen ? row.createdAt : null,
    createdAt: row.createdAt,
    created_at: row.createdAt,
  };
}

function serializeConversation(rows = [], user = {}) {
  const latest = rows[rows.length - 1] || {};
  const isProvider = Number(latest.barberOwnerUserId) === Number(user.id);
  const unreadCount = rows.filter((row) => Number(row.sender_user_id) !== Number(user.id) && !row.seen).length;
  const title = isProvider ? latest.customerUsername : latest.barberName;
  const otherUser = isProvider
    ? {
        id: latest.customerUserId,
        username: latest.customerUsername,
        fullName: latest.customerUsername,
      }
    : {
        id: latest.barberOwnerUserId,
        username: latest.barberOwnerUsername,
        fullName: latest.barberName,
      };

  return {
    id: conversationIdFor(latest),
    conversationId: conversationIdFor(latest),
    conversation_id: conversationIdFor(latest),
    customerId: latest.customerUserId,
    customer_id: latest.customerUserId,
    customerUsername: latest.customerUsername,
    customer_username: latest.customerUsername,
    providerId: latest.barberId,
    provider_id: latest.barberId,
    barberId: latest.barberId,
    barber_id: latest.barberId,
    title,
    otherUser,
    other_user: otherUser,
    provider: {
      id: latest.barberId,
      businessName: latest.barberName,
      business_name: latest.barberName,
      userId: latest.barberOwnerUserId,
      user_id: latest.barberOwnerUserId,
    },
    lastMessage: serializeMessage(latest),
    last_message: serializeMessage(latest),
    lastMessageText: latest.text || "",
    unreadCount,
    unread_count: unreadCount,
    updatedAt: latest.createdAt,
    updated_at: latest.createdAt,
    messages: rows.map(serializeMessage),
  };
}

async function getConversationRows({ barberId, customerUsername, user }) {
  const barber = await getBarberById(barberId);
  if (!barber) {
    const error = new Error("Barber not found.");
    error.statusCode = 404;
    throw error;
  }

  const customer = await getUserByUsername(customerUsername);
  if (!customer) {
    const error = new Error("Customer not found.");
    error.statusCode = 404;
    throw error;
  }

  const isCustomer = Number(customer.id) === Number(user.id);
  const isBarber = Number(barber.owner_user_id) === Number(user.id);
  if (!isCustomer && !isBarber) {
    const error = new Error("You are not allowed to view this conversation.");
    error.statusCode = 403;
    throw error;
  }

  return dbAll(
    `SELECT
      m.id,
      m.barber_id AS barberId,
      b.business_name AS barberName,
      b.owner_user_id AS barberOwnerUserId,
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
    [barberId, customer.id]
  );
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

          // Prevent self-notifications: if the sender and recipient are the same
          // person (e.g. a provider messaging their own stand in a test), skip
          // the notification and push entirely so users never see
          // "SI-World sent you a message" when they ARE SI-World.
          if (Number(recipientUserId) !== Number(req.user.id)) {
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

export async function getConversations(req, res, next) {
  try {
    await ensureMessagesTable();

    const rows = await dbAll(
      `SELECT
        m.id,
        m.barber_id AS barberId,
        b.business_name AS barberName,
        b.owner_user_id AS barberOwnerUserId,
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
       WHERE m.customer_user_id = ?
          OR b.owner_user_id = ?
       ORDER BY m.id ASC`,
      [req.user.id, req.user.id]
    );

    const grouped = new Map();
    rows.forEach((row) => {
      const key = conversationIdFor(row);
      grouped.set(key, [...(grouped.get(key) || []), row]);
    });

    const conversations = [...grouped.values()]
      .map((items) => serializeConversation(items, req.user))
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    res.status(200).json({ success: true, conversations });
  } catch (error) {
    next(error);
  }
}

export async function startConversation(req, res, next) {
  try {
    await ensureMessagesTable();
    const barberId = req.body.barberId || req.body.barber_id || req.body.providerId || req.body.provider_id;
    let customerUsername = String(req.body.customerUsername || req.body.customer_username || "").trim();

    const barber = await getBarberById(barberId);
    if (!barber) {
      return res.status(404).json({
        success: false,
        message: "Barber not found.",
      });
    }

    if (!customerUsername && Number(barber.owner_user_id) !== Number(req.user.id)) {
      customerUsername = req.user.username;
    }

    if (!barberId || !customerUsername) {
      return res.status(400).json({
        success: false,
        message: "barberId and customerUsername are required.",
      });
    }

    const rows = await getConversationRows({ barberId, customerUsername, user: req.user });
    const conversation = rows.length
      ? serializeConversation(rows, req.user)
      : {
          id: `${barberId}:${customerUsername}`,
          conversationId: `${barberId}:${customerUsername}`,
          providerId: barberId,
          provider_id: barberId,
          barberId,
          barber_id: barberId,
          customerUsername,
          customer_username: customerUsername,
          title: Number(barber.owner_user_id) === Number(req.user.id) ? customerUsername : barber.business_name,
          provider: {
            id: barber.id,
            businessName: barber.business_name,
            business_name: barber.business_name,
            userId: barber.owner_user_id,
            user_id: barber.owner_user_id,
          },
          messages: [],
          unreadCount: 0,
          unread_count: 0,
          updatedAt: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

    res.status(200).json({ success: true, conversation });
  } catch (error) {
    next(error);
  }
}

export async function getConversationById(req, res, next) {
  try {
    await ensureMessagesTable();
    const { barberId, customerUsername } = parseConversationId(req.params.conversationId);
    const rows = await getConversationRows({ barberId, customerUsername, user: req.user });
    const conversation = rows.length
      ? serializeConversation(rows, req.user)
      : {
          id: req.params.conversationId,
          conversationId: req.params.conversationId,
          providerId: barberId,
          provider_id: barberId,
          barberId,
          barber_id: barberId,
          customerUsername,
          customer_username: customerUsername,
          messages: [],
          unreadCount: 0,
          unread_count: 0,
        };

    res.status(200).json({
      success: true,
      conversation,
      messages: conversation.messages || [],
    });
  } catch (error) {
    next(error);
  }
}

export async function sendMessageToConversation(req, res, next) {
  try {
    const { barberId, customerUsername } = parseConversationId(req.params.conversationId);
    req.body = {
      ...req.body,
      barberId,
      customerUsername,
      text: req.body.text || req.body.body,
    };
    return sendMessage(req, res, next);
  } catch (error) {
    next(error);
  }
}

export async function markConversationRead(req, res, next) {
  try {
    await ensureMessagesTable();
    const { barberId, customerUsername } = parseConversationId(req.params.conversationId);
    const rows = await getConversationRows({ barberId, customerUsername, user: req.user });
    if (!rows.length) {
      return res.status(200).json({ success: true, readAt: new Date().toISOString() });
    }

    const customerUserId = rows[0].customerUserId;
    await dbRun(
      `UPDATE messages
       SET seen = 1
       WHERE barber_id = ?
         AND customer_user_id = ?
         AND sender_user_id <> ?`,
      [barberId, customerUserId, req.user.id]
    );

    res.status(200).json({ success: true, readAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
}
