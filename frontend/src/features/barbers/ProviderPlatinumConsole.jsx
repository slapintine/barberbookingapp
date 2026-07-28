import { useEffect, useMemo, useState } from "react";
import { FiAlertCircle, FiBarChart2, FiBriefcase, FiCalendar, FiCheckCircle, FiDownload, FiMapPin, FiRefreshCw, FiSend, FiUsers, FiZap } from "react-icons/fi";
import {
  assignProviderPlatinumBooking,
  createProviderPlatinumBranch,
  createProviderPlatinumInvitation,
  createProviderPlatinumStaff,
  draftProviderPlatinumAssistant,
  exportProviderPlatinumCsv,
  getProviderPlatinumDashboard,
  getProviderPlatinumReport,
  saveProviderPlatinumStaffSchedule,
} from "../../api/providerPlatinumApi.js";
import "./ProviderPlatinumConsole.css";

const TABS = [
  ["overview", "Overview", FiBriefcase],
  ["team", "Team", FiUsers],
  ["branches", "Branches", FiMapPin],
  ["schedule", "Schedule", FiCalendar],
  ["assign", "Assign", FiCheckCircle],
  ["analytics", "Analytics", FiBarChart2],
  ["reports", "Reports", FiDownload],
  ["assistant", "Assistant", FiZap],
];

function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function nextWeekKey() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function money(value) {
  const amount = Number(value || 0);
  return amount > 0 ? `UGX ${amount.toLocaleString()}` : "Unknown";
}

function safeList(list) {
  return Array.isArray(list) ? list : [];
}

function StatusMessage({ message, tone = "info" }) {
  if (!message) return null;
  return <div className={`platinum-console-message ${tone}`}><FiAlertCircle /> {message}</div>;
}

export default function ProviderPlatinumConsole({ onBack, onUpgradePlan }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [staffForm, setStaffForm] = useState({ displayName: "", email: "", role: "service_professional" });
  const [inviteForm, setInviteForm] = useState({ displayName: "", email: "", role: "service_professional" });
  const [branchForm, setBranchForm] = useState({ name: "", area: "", address: "" });
  const [scheduleForm, setScheduleForm] = useState({ staffId: "", dayOfWeek: "1", startTime: "09:00", endTime: "17:00" });
  const [assignmentForm, setAssignmentForm] = useState({ bookingId: "", staffId: "", branchId: "", confirm: false });
  const [reportForm, setReportForm] = useState({ type: "bookings", from: todayKey(), to: nextWeekKey() });
  const [assistantMessage, setAssistantMessage] = useState("Who is available today?");
  const [assistantResult, setAssistantResult] = useState(null);
  const [report, setReport] = useState(null);

  const load = async () => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const data = await getProviderPlatinumDashboard();
      setState({ loading: false, data, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error?.userMessage || error?.message || "Could not load Platinum operations." });
    }
  };

  useEffect(() => {
    let cancelled = false;
    getProviderPlatinumDashboard()
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: "" });
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ loading: false, data: null, error: error?.userMessage || error?.message || "Could not load Platinum operations." });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = state.data || {};
  const staff = safeList(data.staff);
  const branches = safeList(data.branches);
  const invitations = safeList(data.invitations);
  const unassignedInsights = safeList(data.insights).filter((item) => String(item.code || "").includes("unassigned"));
  const isLocked = !state.loading && !state.data;

  const metrics = useMemo(() => {
    const branchAnalytics = safeList(data.branchAnalytics);
    const staffAnalytics = safeList(data.staffAnalytics);
    const knownRevenue = branchAnalytics.reduce((sum, row) => sum + Number(row.knownRevenue || 0), 0);
    return {
      activeStaff: staff.filter((item) => Number(item.is_active ?? 1) === 1).length,
      branches: branches.filter((item) => Number(item.is_active ?? 1) === 1).length,
      knownRevenue,
      quoteBookings: branchAnalytics.reduce((sum, row) => sum + Number(row.quoteBookings || 0), 0),
      assignedBookings: staffAnalytics.reduce((sum, row) => sum + Number(row.assignedBookings || 0), 0),
      unassigned: unassignedInsights.length,
    };
  }, [data.branchAnalytics, data.staffAnalytics, staff, branches, unassignedInsights.length]);

  async function runAction(label, action) {
    setBusy(label);
    setMessage("");
    try {
      await action();
      setMessage("Saved. The latest provider operations data is refreshed.");
      await load();
    } catch (error) {
      setMessage(error?.userMessage || error?.message || "That operation could not be completed.");
    } finally {
      setBusy("");
    }
  }

  function downloadCsv(result) {
    const blob = new Blob([result.csv], { type: result.contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="platinum-console content-v4 app-page-v4">
      <header className="platinum-console-hero">
        <div>
          <span className="platinum-console-kicker">Provider Platinum</span>
          <h1>Operations console</h1>
          <p>Manage team, branches, assignments, reports, exports, and assistant-backed operations from real Queless booking data.</p>
        </div>
        <div className="platinum-console-hero-actions">
          <button type="button" className="secondary-btn-v4 compact-btn-v4" onClick={onBack}>Back</button>
          <button type="button" className="secondary-btn-v4 compact-btn-v4" onClick={load} disabled={state.loading}><FiRefreshCw /> Refresh</button>
        </div>
      </header>

      {state.loading ? <StatusMessage message="Loading Platinum operations..." /> : null}
      {state.error ? (
        <section className="platinum-console-locked">
          <FiAlertCircle />
          <strong>{state.error}</strong>
          <p>Provider Platinum is required for team and branch operations. Existing Premium tools remain available.</p>
          <button type="button" className="primary-btn-v4" onClick={() => onUpgradePlan?.("PLATINUM")}>Review Platinum</button>
        </section>
      ) : null}
      <StatusMessage message={message} tone={message.startsWith("Saved") ? "success" : "info"} />

      {!isLocked && data ? (
        <>
          <nav className="platinum-console-tabs" aria-label="Provider Platinum sections">
            {TABS.map(([key, label, Icon]) => (
              <button key={key} type="button" className={activeTab === key ? "active" : ""} onClick={() => setActiveTab(key)}>
                <Icon /> <span>{label}</span>
              </button>
            ))}
          </nav>

          {activeTab === "overview" && (
            <section className="platinum-console-grid">
              <article><strong>{metrics.activeStaff}</strong><span>active staff</span></article>
              <article><strong>{metrics.branches}</strong><span>branches</span></article>
              <article><strong>{metrics.unassigned}</strong><span>assignment prompts</span></article>
              <article><strong>{money(metrics.knownRevenue)}</strong><span>known booking value</span></article>
              <article><strong>{metrics.quoteBookings}</strong><span>quote-required bookings</span></article>
              <article><strong>{metrics.assignedBookings}</strong><span>assigned bookings</span></article>
              <div className="platinum-console-wide-card">
                <h2>Action items</h2>
                {safeList(data.insights).length ? safeList(data.insights).slice(0, 5).map((item) => (
                  <p key={`${item.code}-${item.title}`}><strong>{item.title}</strong> {item.body}</p>
                )) : <p>No operational issues found from the current local data.</p>}
              </div>
            </section>
          )}

          {activeTab === "team" && (
            <section className="platinum-console-stack">
              <div className="platinum-console-form">
                <h2>Add staff profile</h2>
                <input placeholder="Display name" value={staffForm.displayName} onChange={(event) => setStaffForm({ ...staffForm, displayName: event.target.value })} />
                <input placeholder="Email" value={staffForm.email} onChange={(event) => setStaffForm({ ...staffForm, email: event.target.value })} />
                <select value={staffForm.role} onChange={(event) => setStaffForm({ ...staffForm, role: event.target.value })}>
                  <option value="manager">Manager</option>
                  <option value="scheduler">Scheduler</option>
                  <option value="service_professional">Service professional</option>
                  <option value="view_only_analyst">View-only analyst</option>
                </select>
                <button type="button" className="primary-btn-v4" disabled={busy === "staff"} onClick={() => runAction("staff", () => createProviderPlatinumStaff(staffForm))}>Add staff</button>
              </div>
              <div className="platinum-console-form">
                <h2>Create invitation</h2>
                <input placeholder="Display name" value={inviteForm.displayName} onChange={(event) => setInviteForm({ ...inviteForm, displayName: event.target.value })} />
                <input placeholder="Invited email" value={inviteForm.email} onChange={(event) => setInviteForm({ ...inviteForm, email: event.target.value })} />
                <select value={inviteForm.role} onChange={(event) => setInviteForm({ ...inviteForm, role: event.target.value })}>
                  <option value="manager">Manager</option>
                  <option value="scheduler">Scheduler</option>
                  <option value="service_professional">Service professional</option>
                  <option value="view_only_analyst">View-only analyst</option>
                </select>
                <button type="button" className="secondary-btn-v4" disabled={busy === "invite"} onClick={() => runAction("invite", () => createProviderPlatinumInvitation(inviteForm))}><FiSend /> Create invitation</button>
                <small>Email delivery is not claimed locally. Use the supported acceptance flow when mail is enabled.</small>
              </div>
              <div className="platinum-console-card-list">
                {staff.map((member) => <article key={member.id}><strong>{member.display_name || member.name}</strong><span>{member.role} - {Number(member.is_active ?? 1) ? "Active" : "Inactive"}</span><small>{member.email || "No email saved"}</small></article>)}
                {invitations.map((item) => <article key={`invite-${item.id}`}><strong>{item.staff_email}</strong><span>{item.role} - {item.status}</span><small>Expires {String(item.expires_at || "").slice(0, 10)}</small></article>)}
              </div>
            </section>
          )}

          {activeTab === "branches" && (
            <section className="platinum-console-stack">
              <div className="platinum-console-form">
                <h2>Add branch</h2>
                <input placeholder="Branch name" value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} />
                <input placeholder="Area" value={branchForm.area} onChange={(event) => setBranchForm({ ...branchForm, area: event.target.value })} />
                <input placeholder="Address" value={branchForm.address} onChange={(event) => setBranchForm({ ...branchForm, address: event.target.value })} />
                <button type="button" className="primary-btn-v4" disabled={busy === "branch"} onClick={() => runAction("branch", () => createProviderPlatinumBranch(branchForm))}>Add branch</button>
              </div>
              <div className="platinum-console-card-list">
                {branches.map((branch) => <article key={branch.id}><strong>{branch.name}</strong><span>{branch.area || branch.address || "Location details pending"}</span><small>{Number(branch.is_primary || 0) ? "Primary branch" : "Branch"} - {Number(branch.is_active ?? 1) ? "Active" : "Inactive"}</small></article>)}
              </div>
            </section>
          )}

          {activeTab === "schedule" && (
            <section className="platinum-console-stack">
              <div className="platinum-console-form">
                <h2>Staff schedule</h2>
                <select value={scheduleForm.staffId} onChange={(event) => setScheduleForm({ ...scheduleForm, staffId: event.target.value })}>
                  <option value="">Choose staff</option>
                  {staff.map((member) => <option key={member.id} value={member.id}>{member.display_name || member.name}</option>)}
                </select>
                <select value={scheduleForm.dayOfWeek} onChange={(event) => setScheduleForm({ ...scheduleForm, dayOfWeek: event.target.value })}>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option key={day} value={index}>{day}</option>)}
                </select>
                <input type="time" value={scheduleForm.startTime} onChange={(event) => setScheduleForm({ ...scheduleForm, startTime: event.target.value })} />
                <input type="time" value={scheduleForm.endTime} onChange={(event) => setScheduleForm({ ...scheduleForm, endTime: event.target.value })} />
                <button type="button" className="primary-btn-v4" disabled={busy === "schedule"} onClick={() => runAction("schedule", () => saveProviderPlatinumStaffSchedule(scheduleForm))}>Save schedule</button>
              </div>
              <div className="platinum-console-card-list">
                {staff.map((member) => <article key={`schedule-${member.id}`}><strong>{member.display_name || member.name}</strong><span>{member.role}</span><small>Use saved schedules for assignment availability checks.</small></article>)}
              </div>
            </section>
          )}

          {activeTab === "assign" && (
            <section className="platinum-console-stack">
              <div className="platinum-console-form">
                <h2>Assign booking</h2>
                <input placeholder="Booking ID" value={assignmentForm.bookingId} onChange={(event) => setAssignmentForm({ ...assignmentForm, bookingId: event.target.value })} />
                <select value={assignmentForm.staffId} onChange={(event) => setAssignmentForm({ ...assignmentForm, staffId: event.target.value })}>
                  <option value="">Choose staff</option>
                  {staff.map((member) => <option key={member.id} value={member.id}>{member.display_name || member.name}</option>)}
                </select>
                <select value={assignmentForm.branchId} onChange={(event) => setAssignmentForm({ ...assignmentForm, branchId: event.target.value })}>
                  <option value="">Use booking branch</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
                <label className="platinum-console-check"><input type="checkbox" checked={assignmentForm.confirm} onChange={(event) => setAssignmentForm({ ...assignmentForm, confirm: event.target.checked })} /> Confirm assignment after backend revalidation</label>
                <button type="button" className="primary-btn-v4" disabled={busy === "assign"} onClick={() => runAction("assign", () => assignProviderPlatinumBooking(assignmentForm))}>Review assignment</button>
              </div>
              <div className="platinum-console-wide-card"><h2>Assignment rules</h2><p>Only active, qualified, branch-assigned, available staff can be assigned. The backend revalidates before saving and never changes booking time, service, or price.</p></div>
            </section>
          )}

          {activeTab === "analytics" && (
            <section className="platinum-console-stack">
              <h2>Branch analytics</h2>
              <div className="platinum-console-card-list">{safeList(data.branchAnalytics).map((row) => <article key={row.branchId}><strong>{row.name}</strong><span>{row.totalBookings} bookings - {money(row.knownRevenue)}</span><small>{row.quoteBookings} quote-required bookings{row.smallSampleWarning ? " - small sample" : ""}</small></article>)}</div>
              <h2>Staff analytics</h2>
              <div className="platinum-console-card-list">{safeList(data.staffAnalytics).map((row) => <article key={row.staffId}><strong>{row.displayName}</strong><span>{row.assignedBookings} assigned - {row.completedBookings} completed</span><small>{row.note}</small></article>)}</div>
            </section>
          )}

          {activeTab === "reports" && (
            <section className="platinum-console-stack">
              <div className="platinum-console-form">
                <h2>Reports and CSV exports</h2>
                <select value={reportForm.type} onChange={(event) => setReportForm({ ...reportForm, type: event.target.value })}>{["bookings", "revenue", "branches", "staff", "services", "cancellations"].map((type) => <option key={type} value={type}>{type}</option>)}</select>
                <input type="date" value={reportForm.from} onChange={(event) => setReportForm({ ...reportForm, from: event.target.value })} />
                <input type="date" value={reportForm.to} onChange={(event) => setReportForm({ ...reportForm, to: event.target.value })} />
                <button type="button" className="secondary-btn-v4" onClick={() => runAction("report", async () => setReport((await getProviderPlatinumReport(reportForm)).report))}>Preview report</button>
                <button type="button" className="primary-btn-v4" onClick={() => runAction("export", async () => downloadCsv(await exportProviderPlatinumCsv(reportForm)))}><FiDownload /> Export CSV</button>
              </div>
              {report ? <div className="platinum-console-wide-card"><h2>Report preview</h2><p>{report.rowCount} rows. {report.truncated ? "Row limit reached." : "Within row limit."}</p></div> : null}
            </section>
          )}

          {activeTab === "assistant" && (
            <section className="platinum-console-stack">
              <div className="platinum-console-form">
                <h2>Advanced Provider Assistant</h2>
                <textarea value={assistantMessage} onChange={(event) => setAssistantMessage(event.target.value)} />
                <button type="button" className="primary-btn-v4" onClick={() => runAction("assistant", async () => setAssistantResult(await draftProviderPlatinumAssistant({ message: assistantMessage })))}>Ask assistant</button>
              </div>
              {assistantResult ? <div className="platinum-console-wide-card"><h2>{assistantResult.intent}</h2><p>{assistantResult.answer}</p>{assistantResult.confirmationRequired ? <p>Confirmation is required before any related write action.</p> : null}</div> : null}
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
