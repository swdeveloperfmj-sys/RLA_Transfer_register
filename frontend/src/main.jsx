import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import toast, { Toaster } from "react-hot-toast";
import {
  FaBars,
  FaBuilding,
  FaChevronLeft,
  FaLocationDot,
  FaPlus,
  FaShieldHalved,
  FaUsers,
  FaXmark,
  FaRightFromBracket,
  FaPenToSquare,
  FaTrashCan,
  FaMoon,
  FaSun,
  FaEye,
  FaEyeSlash,
  FaBell,
  FaFileInvoice,
} from "react-icons/fa6";
import "./styles.css?v=20261008-report-layout";
import TransportPage from "./TransportPage.jsx";
import HoldReportPage from "./HoldReportPage.jsx";
import TransactionReportPage from "./TransactionReportPage.jsx";
import AodPage from "./AodPage.jsx";
import AodWorkPage from "./AodWorkPage.jsx";
import rlaLogo from "../assets/logo.png";

// React Icons design system aliases keep icon use consistent throughout the dashboard.
const Building2 = FaBuilding;
const LogOut = FaRightFromBracket;
const MapPin = FaLocationDot;
const Menu = FaBars;
const PanelLeftClose = FaChevronLeft;
const Plus = FaPlus;
const ShieldCheck = FaShieldHalved;
const Users = FaUsers;
const X = FaXmark;

const USER_PERMISSION_GROUPS = [
  { title: "Transfer functions", options: [
    { key: "transfer", label: "Transfer" },
    { key: "invoiceRequests", label: "TOG Requests" },
    { key: "incoming", label: "Incoming Transfers" },
  ] },
  { title: "AOD functions", options: [
    { key: "aod", label: "Raise AOD" },
    { key: "myAods", label: "My Raised AODs" },
    { key: "aodRequests", label: "AOD Destination Requests" },
    { key: "aodTransport", label: "AOD Transfer Requests" },
    { key: "aodReturns", label: "AOD Returns" },
  ] },
  { title: "Reports", options: [
    { key: "heldReports", label: "Held Item Reports" },
    { key: "transactionReports", label: "Transaction Reports" },
    { key: "aodReports", label: "AOD Reports" },
  ] },
];
const ALL_USER_PERMISSIONS = USER_PERMISSION_GROUPS.flatMap((group) => group.options.map((option) => option.key));
const DEFAULT_USER_PERMISSIONS = ALL_USER_PERMISSIONS.filter((permission) => !permission.endsWith("Reports"));
const legacyPermissionsFor = (user) => user.role === "super_admin"
  ? ALL_USER_PERMISSIONS
  : [...DEFAULT_USER_PERMISSIONS, ...(user.role === "manager" && user.location?.trim().toLowerCase() === "head office" ? ["heldReports", "transactionReports", "aodReports"] : [])];

function PermissionSelector({ permissions, onChange, disabled = false }) {
  const toggle = (key) => onChange(permissions.includes(key) ? permissions.filter((permission) => permission !== key) : [...permissions, key]);
  return <fieldset className="permission-selector" disabled={disabled}>
    <legend>Allowed dashboard functions</legend>
    <p>Dashboard is always available. Select the additional functions this user can access.</p>
    <div className="permission-selector-actions"><button type="button" onClick={() => onChange([...ALL_USER_PERMISSIONS])}>Select all</button><button type="button" onClick={() => onChange([])}>Clear all</button></div>
    {USER_PERMISSION_GROUPS.map((group) => <section key={group.title}><strong>{group.title}</strong><div>{group.options.map((option) => <label className="permission-option" key={option.key}><input type="checkbox" checked={permissions.includes(option.key)} onChange={() => toggle(option.key)} /><span>{option.label}</span></label>)}</div></section>)}
  </fieldset>;
}

function PasswordInput({ value, onChange, ...props }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-control"><input {...props} type={visible ? "text" : "password"} value={value} onChange={onChange} /><button type="button" className="password-toggle" onClick={() => setVisible(!visible)} title={visible ? "Hide password" : "Show password"}>{visible ? <FaEyeSlash /> : <FaEye />}</button></span>;
}

function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm, danger = false }) {
  return <div className="confirm-backdrop" role="presentation">
    <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
      <span className={`confirm-icon ${danger ? "danger" : ""}`}>{danger ? "!" : "?"}</span>
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="confirm-actions"><button className="confirm-cancel" onClick={onCancel}>Cancel</button><button className={danger ? "confirm-danger" : "confirm-primary"} onClick={onConfirm}>{confirmLabel}</button></div>
    </section>
  </div>;
}

function EditLocationDialog({ location, onClose, onSave }) {
  const [name, setName] = useState(location.name);
  const [code, setCode] = useState(location.code || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return setError("Location name is required.");
    const trimmedCode = code.trim();
    if (trimmedName === location.name && trimmedCode === location.code) return onClose();
    setBusy(true);
    setError("");
    try {
      await onSave({ name: trimmedName, code: trimmedCode });
    } catch (saveError) {
      setError(saveError.message);
      setBusy(false);
    }
  };
  return <div className="confirm-backdrop" role="presentation">
    <section className="confirm-dialog edit-location-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-location-title">
      <h2 id="edit-location-title">Edit location</h2>
      <form onSubmit={submit}>
        <label>Location name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Location code <small>Example: HO01</small><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="HO01" /></label>
        {error && <div className="error">{error}</div>}
        <div className="confirm-actions"><button type="button" className="confirm-cancel" onClick={onClose}>Cancel</button><button className="confirm-primary" disabled={busy}>{busy ? "Saving..." : "Save changes"}</button></div>
      </form>
    </section>
  </div>;
}

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const request = async (path, options = {}) => {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data.message || "Request failed.");
  return data;
};
const urlBase64ToUint8Array = (value) => {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otp, setOtp] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      if (result.requiresOtp) { setOtpEmail(result.email); return; }
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const verifyOtp = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try { onLogin(await request("/auth/verify-super-admin", { method: "POST", body: JSON.stringify({ email: otpEmail, code: otp }) })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return (
    <main className="login-page">
      <section className="brand-panel">
        <div className="logo">
          <img src={rlaLogo} className="brand-logo-image" alt="RLA Transfer" />
        </div>
        <div>
          <span className="eyebrow">OPERATIONS PORTAL</span>
          <h1>
            Manage every
            <br />
            location with clarity.
          </h1>
          <p>Secure, location-based access for your people and operations.</p>
        </div>
        <div className="brand-footer">© 2026 PCS Develop · Internal systems</div>
      </section>
      <section className="login-card">
        <div className="mobile-logo">
          <img src={rlaLogo} className="brand-logo-image" alt="RLA Transfer" />
        </div>
        <div className="login-copy">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>{otpEmail ? "Verify your sign in" : "Sign in to your account"}</h2>
          <p>{otpEmail ? `A 6-digit code was sent to ${otpEmail}.` : "Enter your details to access your workspace."}</p>
        </div>
        {otpEmail ? <form onSubmit={verifyOtp}>
          <label>Verification code<input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" maxLength="6" placeholder="Enter 6-digit code" required /></label>
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? "Verifying…" : "Verify and sign in"}</button>
          <button type="button" className="otp-resend" disabled={busy} onClick={submit}>Resend code</button>
        </form> : <form onSubmit={submit}>
          <label>
            Work email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>
          <label>
            Password
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        </form>}
        <p className="help">Need access? Contact your system administrator.</p>
      </section>
    </main>
  );
}

function AddUser({ locations, roles, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    confirmEmail: "",
    mobileNumber: "",
    password: "",
    confirmPassword: "",
    location: "",
    role: "manager",
    permissions: [...DEFAULT_USER_PERMISSIONS],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [mobileCode, setMobileCode] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [mobileVerified, setMobileVerified] = useState(false);
  const [verifying, setVerifying] = useState("");
  const sendCode = async (channel) => {
    const target = channel === "email" ? { email: form.email } : { mobileNumber: form.mobileNumber };
    setVerifying(`${channel}-send`); setError("");
    try { await request(`/users/verification/${channel}/send`, { method: "POST", body: JSON.stringify(target) }); }
    catch (err) { setError(err.message); }
    finally { setVerifying(""); }
  };
  const confirmCode = async (channel) => {
    const target = channel === "email" ? { email: form.email, code: emailCode } : { mobileNumber: form.mobileNumber, code: mobileCode };
    setVerifying(`${channel}-confirm`); setError("");
    try { await request(`/users/verification/${channel}/confirm`, { method: "POST", body: JSON.stringify(target) }); channel === "email" ? setEmailVerified(true) : setMobileVerified(true); }
    catch (err) { setError(err.message); }
    finally { setVerifying(""); }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword)
      return setError("Passwords do not match.");
    if (!emailVerified) return setError("Verify the work email with its OTP first.");
    if (form.mobileNumber && !mobileVerified) return setError("Verify the mobile number with its OTP first.");
    setBusy(true);
    setError("");
    try {
      const { confirmEmail, confirmPassword, ...data } = form;
      onCreated(
        await request("/users", { method: "POST", body: JSON.stringify(data) }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-wrap">
      <div className="modal">
        <button className="close" onClick={onClose}>
          <FaXmark />
        </button>
        <span className="eyebrow">NEW TEAM MEMBER</span>
        <h2>Create user account</h2>
        <form onSubmit={submit}>
          <label>
            Full name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => { setForm({ ...form, email: e.target.value }); setEmailVerified(false); }}
            />
          </label>
          <div className="otp-row"><button type="button" onClick={() => sendCode("email")} disabled={!form.email || verifying === "email-send" || emailVerified}>{emailVerified ? "Email verified" : verifying === "email-send" ? "Sending…" : "Send email OTP"}</button>{!emailVerified && <><input value={emailCode} onChange={(e) => setEmailCode(e.target.value)} placeholder="Enter email OTP" inputMode="numeric" /><button type="button" onClick={() => confirmCode("email")} disabled={!emailCode || verifying === "email-confirm"}>{verifying === "email-confirm" ? "Checking…" : "Verify"}</button></>}</div>
          <label>
            Mobile number <small>Optional</small>
            <input
              type="tel"
              value={form.mobileNumber}
              onChange={(e) => { setForm({ ...form, mobileNumber: e.target.value }); setMobileVerified(false); }}
            />
          </label>
          {form.mobileNumber && <div className="otp-row"><button type="button" onClick={() => sendCode("mobile")} disabled={verifying === "mobile-send" || mobileVerified}>{mobileVerified ? "Mobile verified" : verifying === "mobile-send" ? "Sending…" : "Send SMS OTP"}</button>{!mobileVerified && <><input value={mobileCode} onChange={(e) => setMobileCode(e.target.value)} placeholder="Enter SMS OTP" inputMode="numeric" /><button type="button" onClick={() => confirmCode("mobile")} disabled={!mobileCode || verifying === "mobile-confirm"}>{verifying === "mobile-confirm" ? "Checking…" : "Verify"}</button></>}</div>}
          <label>
            Role
            <select
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {roles.map((role) => (
                <option key={role._id} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Password
            <PasswordInput
              minLength="8"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label>
            Re-enter password
            <PasswordInput
              minLength="8"
              required
              value={form.confirmPassword}
              onChange={(e) =>
                setForm({ ...form, confirmPassword: e.target.value })
              }
            />
          </label>
          <label>
            Assigned location
            <select
              required
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            >
              <option value="">Select one location</option>
              {locations.map((location) => (
                <option key={location._id} value={location.name}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          {form.role !== "super_admin" && <PermissionSelector permissions={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />}
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? "Creating…" : "Create user"}</button>
        </form>
      </div>
    </div>
  );
}

function EditUser({ user, locations, roles, onClose, onUpdated }) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    mobileNumber: user.mobileNumber || "",
    role: user.role,
    location: user.location || "",
    password: "",
    permissions: Array.isArray(user.permissions) ? user.permissions : legacyPermissionsFor(user),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onUpdated(
        await request(`/users/${user._id}`, {
          method: "PATCH",
          body: JSON.stringify(form),
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-wrap">
      <div className="modal">
        <button className="close" onClick={onClose}>
          <X />
        </button>
        <span className="eyebrow">EDIT TEAM MEMBER</span>
        <h2>Update user account</h2>
        <form onSubmit={submit}>
          <label>
            Full name
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Work email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label>
            Mobile number <small>Optional</small>
            <input
              type="tel"
              value={form.mobileNumber}
              onChange={(e) =>
                setForm({ ...form, mobileNumber: e.target.value })
              }
            />
          </label>
          <label>
            Role
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              {roles.map((role) => (
                <option key={role._id} value={role.key}>
                  {role.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assigned location
            <select
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            >
              {form.role === "super_admin" && <option value="">No location — Super Admin</option>}
              {locations.map((location) => (
                <option key={location._id} value={location.name}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            New password <small>Leave blank to keep current password</small>
            <PasswordInput
              minLength="8"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          {form.role !== "super_admin" && <PermissionSelector permissions={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />}
          {error && <div className="error">{error}</div>}
          <button disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </form>
      </div>
    </div>
  );
}

function ManagerTransferSummary({ user, transfers, locations, onNavigate, canAccess }) {
  const [selectedLocationFlow, setSelectedLocationFlow] = useState(null);
  const outgoing = transfers.filter((transfer) => transfer.sourceLocation === user.location);
  const incoming = transfers.filter((transfer) => transfer.destinationLocation === user.location);
  const activeStatuses = new Set(["awaiting_head_office", "invoice_uploaded", "awaiting_destination"]);
  const inProgress = transfers.filter((transfer) => activeStatuses.has(transfer.status)).length;
  const completed = transfers.filter((transfer) => transfer.status === "completed").length;
  const countStatus = (records, status) => records.filter((transfer) => transfer.status === status).length;
  const statusLabels = {
    awaiting_head_office: "Waiting for TOG",
    invoice_uploaded: "TOG uploaded",
    awaiting_destination: "In transit",
    completed: "Completed",
    closed: "Not Transferable",
  };
  const recent = [...transfers].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const isHeadOfficeManager = user.role === "manager" && user.location?.trim().toLowerCase() === "head office";
  const locationSummaries = locations.map((location) => {
    const locationOutgoing = transfers.filter((transfer) => transfer.sourceLocation === location.name);
    const locationIncoming = transfers.filter((transfer) => transfer.destinationLocation === location.name);
    const managerNames = [...new Set(locationOutgoing.map((transfer) => transfer.requestedBy?.name).filter(Boolean))];
    return { location, outgoing: locationOutgoing, incoming: locationIncoming, managerNames };
  });
  const selectedLocationTransfers = selectedLocationFlow
    ? transfers.filter((transfer) => selectedLocationFlow.direction === "outgoing" ? transfer.sourceLocation === selectedLocationFlow.location : transfer.destinationLocation === selectedLocationFlow.location)
    : [];
  const openPage = (preferred, fallback) => {
    const target = canAccess(preferred) ? preferred : canAccess(fallback) ? fallback : "";
    if (target) onNavigate(target);
  };
  return <section className="manager-transfer-dashboard">
    <div className="manager-overview-cards">
      <button type="button" className="manager-summary-card outgoing" disabled={!canAccess("transfer")} onClick={() => openPage("transfer", "incoming")}><small>Outgoing transfers</small><strong>{outgoing.length}</strong><span>Sent from {user.location}</span><em>View transfers →</em></button>
      <button type="button" className="manager-summary-card incoming" disabled={!canAccess("incoming")} onClick={() => openPage("incoming", "transfer")}><small>Incoming transfers</small><strong>{incoming.length}</strong><span>Sent to {user.location}</span><em>View incoming →</em></button>
      <button type="button" className="manager-summary-card progress" disabled={!canAccess("transfer") && !canAccess("incoming")} onClick={() => openPage("transfer", "incoming")}><small>In progress</small><strong>{inProgress}</strong><span>Waiting or in transit</span><em>View activity →</em></button>
      <button type="button" className="manager-summary-card completed" disabled={!canAccess("incoming") && !canAccess("transfer")} onClick={() => openPage("incoming", "transfer")}><small>Completed</small><strong>{completed}</strong><span>Successfully received</span><em>View completed →</em></button>
    </div>
    {isHeadOfficeManager && <section className="panel head-office-location-summary">
      <div className="location-summary-heading"><div><span>HEAD OFFICE OVERVIEW</span><h2>All location transfer summary</h2><p>Click a transfer count to expand its details below the selected location.</p></div><strong>{locationSummaries.length}<small>Locations</small></strong></div>
      <div className="location-flow-list">
        {locationSummaries.map(({ location, outgoing: locationOutgoing, incoming: locationIncoming, managerNames }) => {
          const selectedDirection = selectedLocationFlow?.location === location.name ? selectedLocationFlow.direction : null;
          const toggleFlow = (direction) => setSelectedLocationFlow((current) => current?.location === location.name && current.direction === direction ? null : { location: location.name, direction });
          return <article className={`location-flow-card${selectedDirection ? " is-expanded" : ""}`} key={location._id || location.name}>
            <div className="location-flow-card-summary">
              <div className="location-flow-identity"><span>{location.name.slice(0, 1).toUpperCase()}</span><div><strong>{location.name}</strong><small>{managerNames.length ? managerNames.join(", ") : "Location team"}</small></div></div>
              <div className="location-flow-actions">
                <button type="button" className={`location-flow-count outgoing${selectedDirection === "outgoing" ? " is-active" : ""}`} disabled={!locationOutgoing.length} aria-expanded={selectedDirection === "outgoing"} onClick={() => toggleFlow("outgoing")}><span><small>Outgoing</small><b>{locationOutgoing.length}</b></span><em>{selectedDirection === "outgoing" ? "Hide details" : "View sent"}</em></button>
                <button type="button" className={`location-flow-count incoming${selectedDirection === "incoming" ? " is-active" : ""}`} disabled={!locationIncoming.length} aria-expanded={selectedDirection === "incoming"} onClick={() => toggleFlow("incoming")}><span><small>Incoming</small><b>{locationIncoming.length}</b></span><em>{selectedDirection === "incoming" ? "Hide details" : "View received"}</em></button>
              </div>
            </div>
            {selectedDirection && <section className={`location-flow-details ${selectedDirection}`}>
              <div className="location-flow-details-heading"><div><span>{selectedDirection}</span><h3>{selectedDirection === "outgoing" ? "Sent from" : "Received by"} {location.name}</h3><p>{selectedLocationTransfers.length} transfer record{selectedLocationTransfers.length === 1 ? "" : "s"}</p></div><button type="button" onClick={() => setSelectedLocationFlow(null)}><FaXmark /> Close</button></div>
              <div className="location-flow-detail-list">{selectedLocationTransfers.map((transfer) => <article key={transfer._id}><div><strong>{transfer.referenceNumber}</strong><span>{transfer.sourceLocation} → {transfer.destinationLocation}</span></div><div><b>{transfer.items?.length || 0} item(s)</b><span>{statusLabels[transfer.status] || transfer.status?.replaceAll("_", " ")}</span></div><time>{new Date(transfer.createdAt).toLocaleString()}</time></article>)}</div>
            </section>}
          </article>;
        })}
      </div>
    </section>}
    <div className="manager-flow-grid">
      <section className="panel manager-flow-panel">
        <div className="manager-flow-heading"><div><span className="manager-direction outgoing">OUT</span><h2>Outgoing summary</h2></div><strong>{outgoing.length}</strong></div>
        <div className="manager-status-list">
          <div><span>Waiting for TOG</span><b>{countStatus(outgoing, "awaiting_head_office")}</b></div>
          <div><span>TOG uploaded</span><b>{countStatus(outgoing, "invoice_uploaded")}</b></div>
          <div><span>In transit</span><b>{countStatus(outgoing, "awaiting_destination")}</b></div>
          <div><span>Completed</span><b>{countStatus(outgoing, "completed")}</b></div>
          <div><span>Not Transferable</span><b>{countStatus(outgoing, "closed")}</b></div>
        </div>
      </section>
      <section className="panel manager-flow-panel">
        <div className="manager-flow-heading"><div><span className="manager-direction incoming">IN</span><h2>Incoming summary</h2></div><strong>{incoming.length}</strong></div>
        <div className="manager-status-list">
          <div><span>In transit</span><b>{countStatus(incoming, "awaiting_destination")}</b></div>
          <div><span>Completed</span><b>{countStatus(incoming, "completed")}</b></div>
          <div><span>Waiting for TOG</span><b>{countStatus(incoming, "awaiting_head_office")}</b></div>
          <div><span>TOG uploaded</span><b>{countStatus(incoming, "invoice_uploaded")}</b></div>
          <div><span>Not Transferable</span><b>{countStatus(incoming, "closed")}</b></div>
        </div>
      </section>
    </div>
    <section className="panel manager-activity-panel">
      <div className="panel-heading"><h2>Recent transfer activity</h2><p>Latest incoming and outgoing transfers for {user.location}.</p></div>
      <div className="manager-activity-list">
        {recent.map((transfer) => {
          const direction = transfer.sourceLocation === user.location ? "Outgoing" : "Incoming";
          const target = direction === "Outgoing" ? "transfer" : "incoming";
          return <article className={canAccess(target) ? "is-clickable" : ""} key={transfer._id} onClick={() => canAccess(target) && onNavigate(target)}><span className={`manager-activity-direction ${direction.toLowerCase()}`}>{direction}</span><div><strong>{transfer.referenceNumber}</strong><span>{transfer.sourceLocation} → {transfer.destinationLocation}</span></div><div className="manager-activity-meta"><b>{statusLabels[transfer.status] || transfer.status?.replaceAll("_", " ")}</b><small>{new Date(transfer.createdAt).toLocaleString()}</small></div></article>;
        })}
        {!recent.length && <p className="manager-activity-empty">No transfer activity is available yet.</p>}
      </div>
    </section>
  </section>;
}

function Dashboard({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newLocationCode, setNewLocationCode] = useState("");
  const [newRole, setNewRole] = useState("");
  const [page, setPage] = useState(() => new URLSearchParams(window.location.search).get("page") || "dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.innerWidth < 860,
  );
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem("rla-theme") === "dark",
  );
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [selectedTransferId, setSelectedTransferId] = useState(() => new URLSearchParams(window.location.search).get("transfer") || "");
  const [transportAod, setTransportAod] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [dashboardTransfers, setDashboardTransfers] = useState([]);
  const shownNotificationIds = useRef(new Set());
  useEffect(() => {
    request("/locations").then(setLocations);
    if (user.role === "super_admin") {
      request("/users")
        .then(setUsers)
        .catch((e) => setError(e.message));
      request("/roles")
        .then(setRoles)
        .catch((e) => setError(e.message));
    }
  }, [user.role]);
  useEffect(() => {
    if (user.role === "super_admin") return undefined;
    let mounted = true;
    const loadDashboardTransfers = async () => {
      try {
        const latest = await request("/transfers");
        if (mounted) setDashboardTransfers(latest);
      } catch (loadError) {
        if (mounted) setError(loadError.message);
      }
    };
    loadDashboardTransfers();
    const interval = window.setInterval(loadDashboardTransfers, 5000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [user.role, user.location]);
  useEffect(() => {
    let mounted = true;
    let initialLoad = true;
    const showNewNotifications = async () => {
      try {
        const latestNotifications = await request("/transfers/notifications");
        if (!mounted) return;
        setNotifications(latestNotifications);
        if (initialLoad) {
          latestNotifications.forEach((notification) => shownNotificationIds.current.add(notification._id));
          initialLoad = false;
          return;
        }
        const unread = latestNotifications.filter((notification) => !notification.read && !shownNotificationIds.current.has(notification._id));
        unread.slice(0, 5).forEach((notification) => {
          shownNotificationIds.current.add(notification._id);
          toast.success(notification.message, { id: `notification-${notification._id}`, duration: 7000 });
        });
      } catch {
        // A temporary notification request failure should not interrupt the dashboard.
      }
    };
    showNewNotifications();
    const interval = window.setInterval(showNewNotifications, 5000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, []);
  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const timer = window.setTimeout(() => setNotificationsOpen(false), 12000);
    return () => window.clearTimeout(timer);
  }, [notificationsOpen]);
  useEffect(() => {
    if (!notificationsOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === "Escape") setNotificationsOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [notificationsOpen]);
  useEffect(() => {
    localStorage.setItem("rla-theme", darkMode ? "dark" : "light");
  }, [darkMode]);
  const enablePhoneAlerts = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) {
      setError("Phone notifications require the installed app to run over HTTPS.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Allow notifications in your phone/browser settings to enable alerts.");
      const { publicKey } = await request("/transfers/push/public-key");
      if (!publicKey) throw new Error("Phone notifications are not configured on the server yet.");
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      await request("/transfers/push/subscribe", { method: "POST", body: JSON.stringify(subscription) });
    } catch (error) { setError(error.message || "Could not enable phone notifications."); }
  };
  useEffect(() => {
    const installedApp = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    if (installedApp && "Notification" in window && Notification.permission !== "denied") enablePhoneAlerts();
  }, []);
  useEffect(() => {
    const syncSidebarForViewport = () => {
      if (window.innerWidth < 860) setSidebarCollapsed(true);
    };
    syncSidebarForViewport();
    window.addEventListener("resize", syncSidebarForViewport);
    return () => window.removeEventListener("resize", syncSidebarForViewport);
  }, []);
  const toggleStatus = async (person) => {
    try {
      const updated = await request(`/users/${person._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !person.isActive }),
      });
      setUsers((all) => all.map((x) => (x._id === updated._id ? updated : x)));
    } catch (e) {
      setError(e.message);
    }
  };
  const assigned =
    user.role === "super_admin"
      ? locations
      : locations.filter((item) => item.name === user.location);
  const createLocation = async (e) => {
    e.preventDefault();
    try {
      const location = await request("/locations", {
        method: "POST",
        body: JSON.stringify({ name: newLocation, code: newLocationCode }),
      });
      setLocations(
        [...locations, location].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewLocation("");
      setNewLocationCode("");
    } catch (e) {
      setError(e.message);
    }
  };
  const changeLocation = async ({ name, code }) => {
    const updated = await request(`/locations/${editingLocation._id}`, {
      method: "PATCH",
      body: JSON.stringify({ name, code }),
    });
    setLocations((all) => all.map((item) => (item._id === updated._id ? updated : item)));
    setEditingLocation(null);
    toast.success("Location updated successfully.");
  };
  const removeLocation = async (item) => {
    try {
      await request(`/locations/${item._id}`, { method: "DELETE" });
      setLocations(locations.filter((x) => x._id !== item._id));
    } catch (e) {
      setError(e.message);
    }
  };
  const createRole = async (e) => {
    e.preventDefault();
    try {
      const role = await request("/roles", {
        method: "POST",
        body: JSON.stringify({ name: newRole }),
      });
      setRoles([...roles, role]);
      setNewRole("");
    } catch (e) {
      setError(e.message);
    }
  };
  const removeRole = async (role) => {
    try {
      await request(`/roles/${role._id}`, { method: "DELETE" });
      setRoles(roles.filter((x) => x._id !== role._id));
    } catch (e) {
      setError(e.message);
    }
  };
  const removeUser = async (person) => {
    try {
      await request(`/users/${person._id}`, { method: "DELETE" });
      setUsers(await request("/users"));
    } catch (e) {
      setError(e.message);
    }
  };
  const titles = {
    dashboard: "Good morning",
    locations: "Locations",
    users: "Users",
    roles: "Roles",
    transport: "Transfer",
    invoiceRequests: "TOG Requests",
    heldReports: "Held Item Reports",
    transactionReports: "Transaction Report",
    aod: "Raise AOD",
    myAods: "My Raised AODs",
    aodRequests: "AOD Ready Requests",
    aodReturns: "AOD Returns",
    aodTransport: "AOD Transfer Requests",
    aodReports: "AOD Reports",
    incoming: "Incoming transfer",
  };
  const markTabNotificationsRead = (target) => {
    const isHeadOfficeUser = user.location?.trim().toLowerCase() === "head office";
    const matched = notifications.filter((notification) => {
      if (notification.read || (!notification.transfer && !notification.aod)) return false;
      if (target === "incoming") return notification.transfer?.destinationLocation === user.location;
      if (target === "invoiceRequests") return isHeadOfficeUser && ["awaiting_head_office", "invoice_uploaded"].includes(notification.transfer?.status);
      if (target === "aodRequests") return !isHeadOfficeUser && notification.aod?.status === "awaiting_destination" && notification.aod?.to === user.location;
      if (target === "aodReturns") return notification.aod?.status === "returning" && notification.aod?.from === user.location;
      if (target === "aodTransport") return notification.aod?.status === "awaiting_transport" && notification.aod?.from === user.location;
      if (target === "transport") return Boolean(notification.transfer) && notification.transfer.destinationLocation !== user.location && !(isHeadOfficeUser && ["awaiting_head_office", "invoice_uploaded"].includes(notification.transfer.status));
      return false;
    });
    if (!matched.length) return;
    const matchedIds = new Set(matched.map((notification) => notification._id));
    setNotifications((all) => all.map((notification) => matchedIds.has(notification._id) ? { ...notification, read: true } : notification));
    matched.forEach((notification) => request(`/transfers/notifications/${notification._id}/read`, { method: "PATCH" }).catch(() => {}));
  };
  const navigate = (nextPage, event) => {
    event?.preventDefault();
    markTabNotificationsRead(nextPage);
    setPage(nextPage);
    setSelectedTransferId("");
    if (window.innerWidth < 860) setSidebarCollapsed(true);
  };
  const confirmLogout = () => {
    setConfirmation({ title: "Log out?", message: "Are you sure you want to log out of RLA Operations?", confirmLabel: "Log out", onConfirm: onLogout });
  };
  const openNotification = async (notification) => {
    setNotificationsOpen(false);
    if (!notification.read) {
      setNotifications((all) => all.map((item) => item._id === notification._id ? { ...item, read: true } : item));
      request(`/transfers/notifications/${notification._id}/read`, { method: "PATCH" }).catch(() => {});
    }
    const transfer = notification.transfer;
    if (notification.aod?._id) { setPage(notification.aod.status === "awaiting_transport" && notification.aod.from === user.location ? "aodTransport" : notification.aod.status === "returning" && notification.aod.from === user.location ? "aodReturns" : "aodRequests"); setSelectedTransferId(""); return; }
    if (!transfer?._id) return;
    const isIncoming = user.location === transfer.destinationLocation;
    const isInvoiceRequest = user.location?.trim().toLowerCase() === "head office" && ["awaiting_head_office", "invoice_uploaded"].includes(transfer.status);
    setSelectedTransferId(transfer._id);
    setPage(isIncoming ? "incoming" : isInvoiceRequest ? "invoiceRequests" : "transport");
    if (window.innerWidth < 860) setSidebarCollapsed(true);
  };
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const isHeadOffice = user.location?.trim().toLowerCase() === "head office";
  const legacyPermissions = legacyPermissionsFor(user);
  const hasPagePermission = (permission) => user.role === "super_admin" || (Array.isArray(user.permissions) ? user.permissions.includes(permission) : legacyPermissions.includes(permission));
  const canViewReports = ["heldReports", "transactionReports", "aodReports"].some(hasPagePermission);
  const updateDot = (target) => {
    const notification = notifications.find((entry) => {
      if (entry.read || (!entry.transfer && !entry.aod)) return false;
      if (target === "incoming") return entry.transfer?.destinationLocation === user.location;
      if (target === "invoiceRequests") return isHeadOffice && ["awaiting_head_office", "invoice_uploaded"].includes(entry.transfer?.status);
      if (target === "aodRequests") return !isHeadOffice && entry.aod?.status === "awaiting_destination" && entry.aod?.to === user.location;
      if (target === "aodReturns") return entry.aod?.status === "returning" && entry.aod?.from === user.location;
      if (target === "aodTransport") return entry.aod?.status === "awaiting_transport" && entry.aod?.from === user.location;
      return Boolean(entry.transfer) && entry.transfer.destinationLocation !== user.location && !(isHeadOffice && ["awaiting_head_office", "invoice_uploaded"].includes(entry.transfer.status));
    });
    if (!notification) return "";
    if (notification.transfer?.status === "awaiting_destination") return "red";
    if (notification.transfer?.status === "awaiting_head_office") return "yellow";
    return "green";
  };
  return (
    <main className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${darkMode ? "theme-dark" : ""}`}>
      <aside onClick={() => sidebarCollapsed && setSidebarCollapsed(false)}>
        <div className="sidebar-top">
          <div className="logo">
            <img src={rlaLogo} className="sidebar-logo-image" alt="RLA Transfer" />
            <span>RLA</span>
          </div>
          {!sidebarCollapsed && <button
            className="collapse-toggle"
            onClick={(event) => { event.stopPropagation(); setSidebarCollapsed(true); }}
            title="Collapse sidebar"
          >
            <PanelLeftClose />
          </button>}
        </div>
        <nav>
          <span className="nav-caption">WORKSPACE</span>
          <a
            className={page === "dashboard" ? "active" : ""}
            href="#dashboard"
            onClick={(event) => navigate("dashboard", event)}
          >
            <ShieldCheck />
            <span>Dashboard</span>
          </a>
          {hasPagePermission("transfer") && <a href="#transport" className={page === "transport" ? "active" : ""} onClick={(event) => navigate("transport", event)}><MapPin /><span>Transfer</span>{updateDot("transport") && <i className={`nav-update-dot ${updateDot("transport")}`} />}</a>}
          {isHeadOffice && hasPagePermission("invoiceRequests") && <a href="#invoice-requests" className={page === "invoiceRequests" ? "active" : ""} onClick={(event) => navigate("invoiceRequests", event)}><FaFileInvoice /><span>TOG Requests</span>{updateDot("invoiceRequests") && <i className={`nav-update-dot ${updateDot("invoiceRequests")}`} />}</a>}
          {!isHeadOffice && hasPagePermission("aodRequests") && <a href="#aod-requests" className={page === "aodRequests" ? "active" : ""} onClick={(event) => navigate("aodRequests", event)}><FaFileInvoice /><span>AOD Destination Requests</span>{updateDot("aodRequests") && <i className={`nav-update-dot ${updateDot("aodRequests")}`} />}</a>}
          {!isHeadOffice && hasPagePermission("aodTransport") && <a href="#aod-transport" className={page === "aodTransport" ? "active" : ""} onClick={(event) => navigate("aodTransport", event)}><FaFileInvoice /><span>AOD Transfer Requests</span>{updateDot("aodTransport") && <i className={`nav-update-dot ${updateDot("aodTransport")}`} />}</a>}
          {hasPagePermission("aodReturns") && <a href="#aod-returns" className={page === "aodReturns" ? "active" : ""} onClick={(event) => navigate("aodReturns", event)}><FaFileInvoice /><span>AOD Returns</span>{updateDot("aodReturns") && <i className={`nav-update-dot ${updateDot("aodReturns")}`} />}</a>}
          {hasPagePermission("incoming") && <a href="#incoming" className={page === "incoming" ? "active" : ""} onClick={(event) => navigate("incoming", event)}><Users /><span>Incoming</span>{updateDot("incoming") && <i className={`nav-update-dot ${updateDot("incoming")}`} />}</a>}
          {hasPagePermission("aod") && <a href="#aod" className={page === "aod" ? "active" : ""} onClick={(event) => navigate("aod", event)}><FaFileInvoice /><span>Raise AOD</span></a>}
          {hasPagePermission("myAods") && <a href="#my-aods" className={page === "myAods" ? "active" : ""} onClick={(event) => navigate("myAods", event)}><FaFileInvoice /><span>My Raised AODs</span></a>}
          {user.role === "super_admin" && (
            <>
              <span className="nav-caption">MANAGEMENT</span>
              <a
                className={page === "locations" ? "active" : ""}
                onClick={() => navigate("locations")}
              >
                <MapPin />
                <span>Locations</span>
              </a>
              <a
                className={page === "users" ? "active" : ""}
                onClick={() => navigate("users")}
              >
                <Users />
                <span>Users</span>
              </a>
              <a
                className={page === "roles" ? "active" : ""}
                onClick={() => navigate("roles")}
              >
                <ShieldCheck />
                <span>Roles</span>
              </a>
            </>
          )}
          {canViewReports && (
            <>
              <span className="nav-caption">REPORTS</span>
              {hasPagePermission("heldReports") && <a className={page === "heldReports" ? "active" : ""} onClick={() => navigate("heldReports")}>
                <FaFileInvoice />
                <span>Held Item Reports</span>
              </a>}
              {hasPagePermission("transactionReports") && <a className={page === "transactionReports" ? "active" : ""} onClick={() => navigate("transactionReports")}>
                <FaFileInvoice />
                <span>Transaction Report</span>
              </a>}
              {hasPagePermission("aodReports") && <a className={page === "aodReports" ? "active" : ""} onClick={() => navigate("aodReports")}><FaFileInvoice /><span>AOD Reports</span></a>}
            </>
          )}
        </nav>
        <div className="side-user">
          <div className="avatar">{user.name[0]}</div>
          <span>
            {user.name}
            <small>
              {user.role === "super_admin" ? "Super Admin" : "Team Member"}
            </small>
          </span>
          <button onClick={confirmLogout} title="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>
      <section className="content">
        <header>
          <div className="header-title">
            <button
              className="mobile-menu"
              onClick={() => setSidebarCollapsed(false)}
            >
              <Menu />
            </button>
            <div>
              <span className="eyebrow">
                {user.role === "super_admin" ? "ADMIN CONSOLE" : "MY WORKSPACE"}
              </span>
              <h1>
                {page === "dashboard"
                  ? `${titles.dashboard}, ${user.name.split(" ")[0]}.`
                  : titles[page]}
              </h1>
            </div>
          </div>
          <div className="header-actions">
          <div className="notification-menu">
            <button className="notification-bell" onClick={() => setNotificationsOpen((open) => !open)} title="Notifications" aria-label="Notifications">
              <FaBell />{unreadCount > 0 && <b>{unreadCount > 9 ? "9+" : unreadCount}</b>}
            </button>
            {notificationsOpen && <section className="notification-panel" aria-label="Recent notifications">
              <div className="notification-panel-title">
                <div><strong>Notifications</strong><span>{unreadCount ? `${unreadCount} unread` : "You're all caught up"}</span></div>
                <div className="notification-panel-controls"><small>Last 2 days</small><button type="button" className="notification-close" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications" title="Close notifications"><FaXmark /></button></div>
              </div>
              {notifications.length ? notifications.map((notification) => <button key={notification._id} className={`notification-item ${notification.read ? "" : "unread"}`} onClick={() => openNotification(notification)}>
                <i aria-hidden="true"><FaBell /></i><span>{notification.message}<small>{new Date(notification.createdAt).toLocaleString()}</small></span>{!notification.read && <em aria-label="Unread notification" />}
              </button>) : <p className="notification-empty">No recent notifications.</p>}
            </section>}
          </div>
          <button className="theme-toggle" onClick={() => setDarkMode(!darkMode)} title={darkMode ? "Use light mode" : "Use dark mode"}>
            {darkMode ? <FaSun /> : <FaMoon />}<span>{darkMode ? "Light" : "Dark"}</span>
          </button>
          </div>
          <button className="logout-mobile" onClick={confirmLogout}>
            <LogOut />
          </button>
          {user.role === "super_admin" && page === "users" && (
            <button className="new-user" onClick={() => setOpen(true)}>
              <Plus /> Add user
            </button>
          )}
        </header>
        {error && <div className="error">{error}</div>}
        {page === "transport" && (hasPagePermission("transfer") || hasPagePermission("aodTransport")) && <TransportPage user={user} locations={locations} highlightTransferId={selectedTransferId} prefillAod={transportAod} onPrefillUsed={() => setTransportAod(null)} />}
        {page === "invoiceRequests" && hasPagePermission("invoiceRequests") && <TransportPage user={user} locations={locations} invoiceRequests highlightTransferId={selectedTransferId} />}
        {page === "incoming" && hasPagePermission("incoming") && <TransportPage user={user} locations={locations} incoming highlightTransferId={selectedTransferId} />}
        {page === "aod" && hasPagePermission("aod") && <AodPage user={user} locations={locations} />}
        {page === "myAods" && hasPagePermission("myAods") && <AodWorkPage user={user} locations={locations} mode="mine" />}
        {page === "aodRequests" && hasPagePermission("aodRequests") && <AodWorkPage user={user} locations={locations} mode="destination" />}
        {page === "aodReturns" && hasPagePermission("aodReturns") && <AodWorkPage user={user} locations={locations} mode="returns" />}
        {page === "aodTransport" && hasPagePermission("aodTransport") && <AodWorkPage user={user} locations={locations} mode="transport" onProceed={(aod) => { setTransportAod(aod); setPage("transport"); }} />}
        {page === "aodReports" && hasPagePermission("aodReports") && <AodWorkPage reports user={user} locations={locations} />}
        {page === "heldReports" && hasPagePermission("heldReports") && <HoldReportPage locations={locations} />}
        {page === "transactionReports" && hasPagePermission("transactionReports") && <TransactionReportPage locations={locations} />}
        {page === "dashboard" && user.role === "super_admin" && (
          <div className="stats">
            <article>
              <span className="icon blue">
                <Users />
              </span>
              <div>
                <strong>
                  {user.role === "super_admin" ? users.length : assigned.length}
                </strong>
                <small>
                  {user.role === "super_admin"
                    ? "Total users"
                    : "Assigned location"}
                </small>
              </div>
            </article>
            <article>
              <span className="icon green">
                <MapPin />
              </span>
              <div>
                <strong>{locations.length}</strong>
                <small>Company locations</small>
              </div>
            </article>
            <article>
              <span className="icon purple">
                <ShieldCheck />
              </span>
              <div>
                <strong>
                  {user.role === "super_admin"
                    ? users.filter((x) => x.isActive).length
                    : "Active"}
                </strong>
                <small>
                  {user.role === "super_admin"
                    ? "Active accounts"
                    : "Account status"}
                </small>
              </div>
            </article>
          </div>
        )}
        {page === "dashboard" && user.role !== "super_admin" && <ManagerTransferSummary user={user} transfers={dashboardTransfers} locations={locations} onNavigate={navigate} canAccess={hasPagePermission} />}
        {user.role === "super_admin" && page === "locations" && (
          <section className="panel locations-panel">
            <div className="panel-heading">
              <h2>Manage locations</h2>
              <p>Add, rename, or delete available locations.</p>
              <form className="inline-form" onSubmit={createLocation}>
                <input
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="New location name"
                  required
                />
                <input value={newLocationCode} onChange={(e) => setNewLocationCode(e.target.value)} placeholder="Location code (e.g. HO01)" required />
                <button>
                  <Plus /> Add location
                </button>
              </form>
            </div>
            <div className="managed-locations">
              {locations.map((item) => (
                <div key={item._id}>
                  <MapPin /> <span>{item.name} <small>{item.code || "Code not assigned"}</small></span>
                  <button onClick={() => setEditingLocation(item)}>Edit</button>
                  <button onClick={() => setConfirmation({ title: "Delete location?", message: `Delete ${item.name}? This cannot be undone.`, confirmLabel: "Delete", danger: true, onConfirm: () => removeLocation(item) })}>Delete</button>
                </div>
              ))}
            </div>
          </section>
        )}
        {user.role === "super_admin" && page === "roles" && (
          <section className="panel locations-panel">
            <div className="panel-heading">
              <h2>Manage roles</h2>
              <p>
                System roles are protected. New roles can be used when creating
                users.
              </p>
              <form className="inline-form" onSubmit={createRole}>
                <input
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="New role name"
                  required
                />
                <button>
                  <Plus /> Add role
                </button>
              </form>
            </div>
            <div className="managed-locations">
              {roles.map((role) => (
                <div key={role._id}>
                  <ShieldCheck /> <span>{role.name}</span>
                  {role.isSystem ? (
                    <em>System</em>
                  ) : (
                    <button onClick={() => setConfirmation({ title: "Delete role?", message: `Delete ${role.name}? This cannot be undone.`, confirmLabel: "Delete", danger: true, onConfirm: () => removeRole(role) })}>Delete</button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
        {(page === "users" || (user.role !== "super_admin" && page === "dashboard")) && (
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {user.role === "super_admin"
                    ? "Team access"
                    : "Your assigned location"}
                </h2>
                <p>
                  {user.role === "super_admin"
                    ? "Review accounts and their location permissions."
                    : "You have access to the following location."}
                </p>
              </div>
            </div>
            {user.role === "super_admin" ? (
              <div className="user-list">
                {users.map((person) => (
                  <div className="person" key={person._id}>
                    <div className="avatar">{person.name[0]}</div>
                    <div className="person-info">
                      <strong>{person.name}</strong>
                      <span>{person.email}</span>
                      <div className="tags">
                        <em>
                          {roles.find((role) => role.key === person.role)
                            ?.name || person.role}
                        </em>
                        <em>{person.location || "No location"}</em>
                      </div>
                    </div>
                    <div className="user-actions">
                      <button className="edit-user" onClick={() => setEditing(person)} title="Edit user"><FaPenToSquare /></button>
                      {person.role !== "super_admin" && (
                        <button className={person.isActive ? "status active-status" : "status"} onClick={() => toggleStatus(person)}>{person.isActive ? "Active" : "Disabled"}</button>
                      )}
                      <button className="delete-user" onClick={() => setConfirmation({ title: "Delete user?", message: `Permanently delete ${person.name}? This cannot be undone.`, confirmLabel: "Delete user", danger: true, onConfirm: () => removeUser(person) })} title="Delete user"><FaTrashCan /></button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="location-grid">
                {assigned.map((item) => (
                  <article key={item._id}>
                    <MapPin />
                    <span>{item.name}</span>
                    <small>Access granted</small>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </section>
      {open && (
        <AddUser
          locations={locations}
          roles={roles}
          onClose={() => setOpen(false)}
          onCreated={(person) => {
            setUsers([person, ...users]);
            setOpen(false);
          }}
        />
      )}
      {editing && <EditUser user={editing} locations={locations} roles={roles} onClose={() => setEditing(null)} onUpdated={async () => { const latestUsers = await request('/users'); setUsers(latestUsers); setEditing(null); }} />}
      {editingLocation && <EditLocationDialog location={editingLocation} onClose={() => setEditingLocation(null)} onSave={changeLocation} />}
      {confirmation && <ConfirmDialog {...confirmation} onCancel={() => setConfirmation(null)} onConfirm={async () => { await confirmation.onConfirm(); setConfirmation(null); }} />}
    </main>
  );
}

function App() {
  const [session, setSession] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!localStorage.getItem("token")) return;
    request("/auth/me").then(({ user }) => {
      localStorage.setItem("user", JSON.stringify(user));
      setSession(user);
    }).catch(() => {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      setSession(null);
    });
  }, []);
  const login = (result) => {
    localStorage.setItem("token", result.token);
    localStorage.setItem("user", JSON.stringify(result.user));
    setSession(result.user);
  };
  const logout = () => {
    localStorage.clear();
    setSession(null);
  };
  return <>
    <Toaster position="bottom-right" toastOptions={{ style: { borderRadius: "12px", background: "#14243b", color: "#fff", maxWidth: "420px" }, success: { iconTheme: { primary: "#62d5b3", secondary: "#14243b" } } }} />
    {session ? <Dashboard user={session} onLogout={logout} /> : <Login onLogin={login} />}
  </>;
}
createRoot(document.getElementById("root")).render(<App />);

if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV) {
    Promise.all([
      navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))),
      "caches" in window ? caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("rla-operations-")).map((key) => caches.delete(key)))) : Promise.resolve(),
    ]).then(() => {
      if (navigator.serviceWorker.controller && sessionStorage.getItem("rla-dev-cache-reset") !== "done") {
        sessionStorage.setItem("rla-dev-cache-reset", "done");
        window.location.reload();
      }
    }).catch(() => {});
  } else {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}
