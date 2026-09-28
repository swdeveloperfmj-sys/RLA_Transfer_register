import React, { useState } from "react";
import fmjHoldingsLogo from "../assets/FMJ Holdings Logo_.jpg";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const blankItem = { code: "", description: "", packaging: "Nos", quantity: 1 };

export default function AodPage({ user, locations }) {
  const [form, setForm] = useState({
    customerName: "",
    customerAddress: "",
    from: user.location || "",
    to: "",
    dispatchedBy: user.name,
    items: [{ ...blankItem }],
  });
  const [generated, setGenerated] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const setField = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const setItem = (index, field, value) => setForm((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
  }));
  const removeItem = (index) => setForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  const generate = async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch(`${API}/aods`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Could not generate AOD.");
      setGenerated(data);
    } catch (generateError) { setError(generateError.message); } finally { setBusy(false); }
  };

  if (generated) return <section className="aod-result-page">
    <div className="aod-result-actions"><button onClick={() => setGenerated(null)}>Edit details</button><button onClick={() => window.print()}>Print AOD</button></div>
    <article className="aod-sheet">
      <div className="aod-sheet-top">
        <section className="aod-company-block"><h2>FMJ Plastics (Pvt) Ltd.</h2><p>289 Galle Road, Henamulla,<br />Panadura, 12550, Sri Lanka.</p><dl><dt>Tel</dt><dd>038-2232976, 038-2238217<br />038-7211928</dd><dt>Fax</dt><dd>038-2298200</dd><dt>E-mail</dt><dd>fmjholdings@fmjgp.lk</dd><dt>Web</dt><dd>www.fmjgp.lk</dd></dl></section>
        <section className="aod-customer-block"><div className="aod-doc-number"><b>AOD No.</b><strong>{generated.number}</strong></div><div className="aod-destination"><b>Customer / Destination Name & Address</b><strong>{generated.customerName}</strong><span>{generated.customerAddress || "—"}</span></div></section>
        <section className="aod-brand-block"><h1>ADVICE OF DESPATCH</h1><i>Please receive the following from</i><strong>FMJ PLASTICS</strong><small>A Member of</small><img className="aod-fmj-logo" src={fmjHoldingsLogo} alt="FMJ Holdings" /><div className="aod-date"><b>AOD Date</b><span>{new Date(generated.createdAt).toLocaleDateString()}</span></div></section>
      </div>
      <div className="aod-details-row"><div><b>From</b><span>{generated.from}</span></div><div><b>To</b><span>{generated.to}</span></div><div><b>Despatched by</b><span>{generated.dispatchedBy}</span></div></div>
      <table className="aod-goods"><thead><tr><th>CODE NO.</th><th>DESCRIPTION OF GOODS / SERVICES</th><th>PACKAGING</th><th>QUANTITY</th></tr></thead><tbody>{generated.items.map((item, index) => <tr key={index}><td>{item.code || "—"}</td><td>{item.description || "—"}</td><td>{item.packaging || "—"}</td><td>{item.quantity}</td></tr>)}</tbody></table>
      <div className="aod-sign-row"><span>Approved by (Name & Signature)</span><span>Collected by (Name & Signature)</span></div>
      <footer>Location: 62 Galle Road, Henamulla, Panadura, 12550, Sri Lanka</footer>
    </article>
  </section>;

  return <section className="aod-form-page">
    <div className="panel-heading"><span className="eyebrow">ADVICE OF DESPATCH</span><h2>Raise AOD</h2><p>Complete the form to generate a print-ready AOD.</p></div>
    <form className="aod-normal-form" onSubmit={generate}>
      <label>Customer / Destination name<input required value={form.customerName} onChange={(event) => setField("customerName", event.target.value)} /></label>
      <label className="aod-wide-field">Customer / Destination address<textarea required value={form.customerAddress} onChange={(event) => setField("customerAddress", event.target.value)} /></label>
      <label>From<input required value={form.from} onChange={(event) => setField("from", event.target.value)} /></label>
      <label>To<select required value={form.to} onChange={(event) => setField("to", event.target.value)}><option value="">Select destination</option>{locations.map((location) => <option key={location._id} value={location.name}>{location.name}</option>)}</select></label>
      <label>Despatched by<input required value={form.dispatchedBy} onChange={(event) => setField("dispatchedBy", event.target.value)} /></label>
      <div className="aod-form-items"><div className="aod-form-items-title"><h3>Goods / Services</h3><button type="button" onClick={() => setField("items", [...form.items, { ...blankItem }])}>Add item</button></div>{form.items.map((item, index) => <div className="aod-form-item" key={index}><input placeholder="Code no." required value={item.code} onChange={(event) => setItem(index, "code", event.target.value)} /><input placeholder="Description" required value={item.description} onChange={(event) => setItem(index, "description", event.target.value)} /><input placeholder="Packaging" required value={item.packaging} onChange={(event) => setItem(index, "packaging", event.target.value)} /><input aria-label="Quantity" type="number" min="1" required value={item.quantity} onChange={(event) => setItem(index, "quantity", Number(event.target.value))} />{form.items.length > 1 && <button type="button" className="aod-remove-item" onClick={() => removeItem(index)}>Remove</button>}</div>)}</div>
      {error && <div className="error aod-form-error">{error}</div>}
      <button className="aod-generate" disabled={busy}>{busy ? "Generating..." : "Generate AOD"}</button>
    </form>
  </section>;
}
