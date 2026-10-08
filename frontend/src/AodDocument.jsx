import React from "react";
import fmjHoldingsLogo from "../assets/FMJ Holdings Logo_.jpg";
import rlLogo from "../assets/rllogo.png";

export const MAX_AOD_ITEMS = 7;

export default function AodDocument({ aod, className = "", style, onClick }) {
  const sourceItems = aod.items || [];
  const items = [
    ...sourceItems.slice(0, MAX_AOD_ITEMS),
    ...Array(Math.max(0, MAX_AOD_ITEMS - sourceItems.length)).fill(null),
  ];

  return (
    <article
      className={`aod-sheet aod-static-document ${className}`.trim()}
      style={style}
      onClick={onClick}
    >
      <div className="aod-sheet-top">
        <section className="aod-company-block">
          <h3 style={{ fontSize: "14px" }}>Royal Lanka Agencies (Pvt) Ltd.</h3>
          <p>289 Galle Road, Henamulla,<br />Panadura, 12550, Sri Lanka.</p>
          <dl>
            <dt>Tel</dt><dd>038-2232976, 038-2238217<br />038-7211928</dd>
            <dt>Fax</dt><dd>038-2298200</dd>
            <dt>E-mail</dt><dd>fmjholdings@fmjgp.lk</dd>
            <dt>Web</dt><dd>www.fmjgp.lk</dd>
          </dl>
        </section>
        <section className="aod-customer-block">
          <div className="aod-doc-number"><b>AOD No.</b><strong>{aod.number}</strong></div>
          <div className="aod-destination">
            <b>Customer / Destination Name &amp; Address</b>
            <strong>{aod.customerName}</strong>
            <span>{aod.customerAddress || "—"}</span>
          </div>
        </section>
        <section className="aod-brand-block">
          <h1>ADVICE OF DESPATCH</h1>
          <i>Please receive the following from</i>
          <img className="aod-rl-logo" src={rlLogo} alt="R L Plastics" />
          <small>A Member of</small>
          <img className="aod-fmj-logo" src={fmjHoldingsLogo} alt="FMJ Holdings" />
          <div className="aod-date">
            <b>AOD Date</b>
            <span>{new Date(aod.createdAt).toLocaleDateString()}</span>
          </div>
        </section>
      </div>
      <div className="aod-details-row">
        <div><b>From</b><span>{aod.from}</span></div>
        <div><b>To</b><span>{aod.to}</span></div>
        <div><b>Despatched by</b><span>{aod.dispatchedBy}</span></div>
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
          {items.map((item, index) => (
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
        <span>Approved by (Name &amp; Signature)</span>
        <span>Collected by (Name &amp; Signature)</span>
      </div>
      <footer>Location: 62 Galle Road, Henamulla, Panadura, 12550, Sri Lanka</footer>
    </article>
  );
}
