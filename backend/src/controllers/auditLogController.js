import { all, get } from "../db/query.js";

// Admin-only, read-only view of the security audit trail. Metadata is already
// redacted at write time, and hashed IP/UA columns are intentionally NOT exposed.
export async function getSecurityAuditLogs(req, res, next) {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];
    if (req.query.event_type) {
      where.push("event_type = ?");
      params.push(String(req.query.event_type));
    }
    if (req.query.actor_user_id) {
      where.push("actor_user_id = ?");
      params.push(Number(req.query.actor_user_id));
    }
    if (req.query.target_type) {
      where.push("target_type = ?");
      params.push(String(req.query.target_type));
    }
    if (req.query.target_id) {
      where.push("target_id = ?");
      params.push(String(req.query.target_id));
    }
    if (req.query.from) {
      where.push("created_at >= ?");
      params.push(String(req.query.from));
    }
    if (req.query.to) {
      where.push("created_at <= ?");
      params.push(`${String(req.query.to)} 23:59:59`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const totalRow = await get(`SELECT COUNT(*) AS count FROM security_audit_logs ${whereSql}`, params);
    const rows = await all(
      `SELECT id, event_type, actor_user_id, actor_role, target_type, target_id, created_at, metadata
       FROM security_audit_logs
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const logs = rows.map((row) => {
      let metadata = {};
      try {
        metadata = typeof row.metadata === "string" ? JSON.parse(row.metadata || "{}") : row.metadata || {};
      } catch {
        metadata = {};
      }
      return {
        id: row.id,
        event_type: row.event_type,
        actor_user_id: row.actor_user_id,
        actor_role: row.actor_role,
        target_type: row.target_type,
        target_id: row.target_id,
        created_at: row.created_at,
        metadata,
      };
    });

    res.status(200).json({
      success: true,
      page,
      pageSize,
      total: Number(totalRow?.count || 0),
      logs,
    });
  } catch (error) {
    next(error);
  }
}
