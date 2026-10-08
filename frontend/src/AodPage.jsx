import React, { useRef, useState } from "react";
import fmjHoldingsLogo from "../assets/FMJ Holdings Logo_.jpg";
import rlLogo from "../assets/rllogo.png";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const blankItem = { code: "", description: "", packaging: "Nos", quantity: 1 };
const MAX_AOD_ITEMS = 7;

export default function AodPage({ user, locations }) {
  const itemInputRefs = useRef({});
  const [form, setForm] = useState({
    number: "",
    customerName: "",
    customerAddress: "",
    from: user.location || "",
    to: "",
    dispatchedBy: user.name,
    items: [{ ...blankItem }],
  });
  const [generated, setGenerated] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const closeGenerated = () => {
    setGenerated(null);
    setEditingId(null);
    setError("");
    setForm({
      number: "",
      customerName: "",
      customerAddress: "",
      from: user.location || "",
      to: "",
      dispatchedBy: user.name,
      items: [{ ...blankItem }],
    });
  };
  const setField = (field, value) =>
    setForm((current) => ({ ...current, [field]: value }));
  const setItem = (index, field, value) =>
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  const removeItem = (index) =>
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  const focusItemField = (index, field) => {
    requestAnimationFrame(() => itemInputRefs.current[`${index}-${field}`]?.focus());
  };
  const handleItemEnter = (event, index, field) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (field === "code") {
      focusItemField(index, "description");
      return;
    }
    if (field === "description") {
      focusItemField(index, "quantity");
      return;
    }
    if (field === "quantity") {
      if (index < form.items.length - 1) {
        focusItemField(index + 1, "code");
        return;
      }
      if (form.items.length >= MAX_AOD_ITEMS) return;
      const nextIndex = form.items.length;
      setForm((current) => ({ ...current, items: [...current.items, { ...blankItem }] }));
      focusItemField(nextIndex, "code");
    }
  };
  const generate = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${API}/aods${editingId ? `/${editingId}` : ""}`,
        {
          method: editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
          body: JSON.stringify(form),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Could not generate AOD.");
      setGenerated(data);
      setEditingId(null);
    } catch (generateError) {
      setError(generateError.message);
    } finally {
      setBusy(false);
    }
  };

  if (generated)
    return (
      <section className="aod-result-page">
        <div className="aod-result-actions">
          <button
            onClick={() => {
              setForm({
                number: generated.number,
                customerName: generated.customerName,
                customerAddress: generated.customerAddress || "",
                from: generated.from,
                to: generated.to,
                dispatchedBy: generated.dispatchedBy,
                items: generated.items.slice(0, MAX_AOD_ITEMS).map((item) => ({
                  code: item.code || "",
                  description: item.description || "",
                  packaging: "Nos",
                  quantity: item.quantity,
                })),
              });
              setEditingId(generated._id);
              setGenerated(null);
            }}
          >
            Edit details
          </button>
          <button onClick={() => window.print()}>Print AOD</button>
          <button type="button" className="aod-close-generated" onClick={closeGenerated}>Close</button>
        </div>
        <article className="aod-sheet">
          <div className="aod-sheet-top">
            <section className="aod-company-block">
              <h3 style={{ fontSize: "14px" }}>
                Royal Lanka Agencies (Pvt) Ltd.
              </h3>
              <p>
                289 Galle Road, Henamulla,
                <br />
                Panadura, 12550, Sri Lanka.
              </p>
              <dl>
                <dt>Tel</dt>
                <dd>
                  038-2232976, 038-2238217
                  <br />
                  038-7211928
                </dd>
                <dt>Fax</dt>
                <dd>038-2298200</dd>
                <dt>E-mail</dt>
                <dd>fmjholdings@fmjgp.lk</dd>
                <dt>Web</dt>
                <dd>www.fmjgp.lk</dd>
              </dl>
            </section>
            <section className="aod-customer-block">
              <div className="aod-doc-number">
                <b>AOD No.</b>
                <strong>{generated.number}</strong>
              </div>
              <div className="aod-destination">
                <b>Customer / Destination Name & Address</b>
                <strong>{generated.customerName}</strong>
                <span>{generated.customerAddress || "—"}</span>
              </div>
            </section>
            <section className="aod-brand-block">
              <h1>ADVICE OF DESPATCH</h1>
              <i>Please receive the following from</i>
              <img className="aod-rl-logo" src={rlLogo} alt="R L Plastics" />
              <small>A Member of</small>
              <img
                className="aod-fmj-logo"
                src={fmjHoldingsLogo}
                alt="FMJ Holdings"
              />
              <div className="aod-date">
                <b>AOD Date</b>
                <span>
                  {new Date(generated.createdAt).toLocaleDateString()}
                </span>
              </div>
            </section>
          </div>
          <div className="aod-details-row">
            <div>
              <b>From</b>
              <span>{generated.from}</span>
            </div>
            <div>
              <b>To</b>
              <span>{generated.to}</span>
            </div>
            <div>
              <b>Despatched by</b>
              <span>{generated.dispatchedBy}</span>
            </div>
          </div>
          <table className="aod-goods">
            <thead>
              <tr>
                <th>CODE NO.</th>
                <th>DESCRIPTION OF GOODS / SERVICES</th>
                <th>PACKAGING</th>
                <th>QUANTITY</th>
              </tr>
            </thead>
            <tbody>
              {[...generated.items.slice(0, MAX_AOD_ITEMS), ...Array(Math.max(0, MAX_AOD_ITEMS - generated.items.length)).fill(null)].map((item, index) => (
                <tr className={item ? "" : "aod-blank-item-row"} key={item?._id || `item-${index}`}>
                  <td>{item?.code || "\u00A0"}</td>
                  <td>{item?.description || "\u00A0"}</td>
                  <td>{item?.packaging || "\u00A0"}</td>
                  <td>{item?.quantity ?? "\u00A0"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="aod-sign-row">
            <span>Approved by (Name & Signature)</span>
            <span>Collected by (Name & Signature)</span>
          </div>
          <footer>
            Location: 62 Galle Road, Henamulla, Panadura, 12550, Sri Lanka
          </footer>
        </article>
      </section>
    );

  return (
    <section className="aod-template-page">
      <form className="aod-template-form" onSubmit={generate}>
        <article className="aod-sheet aod-editable-sheet">
          <div className="aod-sheet-top">
            <section className="aod-company-block">
              <h3 style={{ fontSize: "14px" }}>Royal Lanka Agencies (Pvt) Ltd.</h3>
              <p>289 Galle Road, Henamulla,<br />Panadura, 12550, Sri Lanka.</p>
              <dl><dt>Tel</dt><dd>038-2232976, 038-2238217<br />038-7211928</dd><dt>Fax</dt><dd>038-2298200</dd><dt>E-mail</dt><dd>fmjholdings@fmjgp.lk</dd><dt>Web</dt><dd>www.fmjgp.lk</dd></dl>
            </section>
            <section className="aod-customer-block">
              <label className="aod-doc-number"><b>AOD No.</b><input value={form.number} placeholder="Auto-generated if blank" onChange={(event) => setField("number", event.target.value)} /></label>
              <label className="aod-destination"><b>Customer / Destination Name & Address</b><input required value={form.customerName} placeholder="Enter customer / destination" onChange={(event) => setField("customerName", event.target.value)} /><textarea required value={form.customerAddress} placeholder="Enter destination address" onChange={(event) => setField("customerAddress", event.target.value)} /></label>
            </section>
            <section className="aod-brand-block">
              <h1>ADVICE OF DESPATCH</h1><i>Please receive the following from</i><img className="aod-rl-logo" src={rlLogo} alt="R L Plastics" /><small>A Member of</small><img className="aod-fmj-logo" src={fmjHoldingsLogo} alt="FMJ Holdings" />
              <div className="aod-date"><b>AOD Date</b><span>{new Date().toLocaleDateString()}</span></div>
            </section>
          </div>
          <div className="aod-details-row">
            <label><b>From</b><input className="aod-locked-field" required readOnly value={form.from} title="From location is assigned automatically" /></label>
            <label><b>To</b><select required value={form.to} onChange={(event) => setField("to", event.target.value)}><option value="">Select destination</option>{locations.map((location) => <option key={location._id} value={location.name}>{location.name}</option>)}</select></label>
            <label><b>Despatched by</b><input required value={form.dispatchedBy} onChange={(event) => setField("dispatchedBy", event.target.value)} /></label>
          </div>
          <table className="aod-goods aod-editable-goods">
            <thead><tr><th>CODE NO.</th><th>DESCRIPTION OF GOODS / SERVICES</th><th>PACKAGING</th><th>QUANTITY</th></tr></thead>
            <tbody>{form.items.map((item, index) => <tr key={index}>
              <td><input ref={(element) => { itemInputRefs.current[`${index}-code`] = element; }} aria-label="Code number" required value={item.code} placeholder="Code" onKeyDown={(event) => handleItemEnter(event, index, "code")} onChange={(event) => setItem(index, "code", event.target.value)} /></td>
              <td className="aod-item-description-cell"><input ref={(element) => { itemInputRefs.current[`${index}-description`] = element; }} aria-label="Description" required value={item.description} placeholder="Description of goods / services" onKeyDown={(event) => handleItemEnter(event, index, "description")} onChange={(event) => setItem(index, "description", event.target.value)} />{form.items.length > 1 && <button type="button" className="aod-template-remove" aria-label="Remove item" title="Remove item" onClick={() => removeItem(index)}>×</button>}</td>
              <td><input className="aod-locked-field" aria-label="Packaging" readOnly value="Nos" title="Packaging is fixed as Nos" /></td>
              <td><input ref={(element) => { itemInputRefs.current[`${index}-quantity`] = element; }} aria-label="Quantity" type="number" min="1" required value={item.quantity} onKeyDown={(event) => handleItemEnter(event, index, "quantity")} onChange={(event) => setItem(index, "quantity", Number(event.target.value))} /></td>
            </tr>)}</tbody>
          </table>
          <div className="aod-sign-row"><span>Approved by (Name & Signature)</span><span>Collected by (Name & Signature)</span></div>
          <footer>Location: 62 Galle Road, Henamulla, Panadura, 12550, Sri Lanka</footer>
        </article>
        {error && <div className="error aod-template-error">{error}</div>}
        <div className="aod-template-submit"><span>Complete all highlighted fields before generating the AOD.</span><button className="aod-generate" disabled={busy}>{busy ? "Saving..." : editingId ? "Save AOD changes" : "Generate AOD document"}</button></div>
      </form>
    </section>
  );
}
