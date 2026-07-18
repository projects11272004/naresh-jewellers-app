import { SHOP } from "./shopInfo";
import { rupeesToWords } from "./numberToWords";
import { formatDateTime } from "./format";
import type { InvoiceItemRow, InvoiceRow, PaymentLine } from "@/types/database";

// ---------------------------------------------------------------------------
// A4 printable Tax Invoice. Layout combines:
//   - the legal fields already on the shop's physical invoice book (GSTIN,
//     bank details, jurisdiction clause, dual signatures)
//   - the itemized Material/Labour charge + tax breakdown structure from the
//     Tanishq reference invoice the client asked to match
//
// This is a first pass - the client said they'll get an exact receipt
// format from the shop later. Everything here is easy to re-lay-out once
// that arrives; the data plumbing (what figures exist, how they're
// computed) will not need to change.
// ---------------------------------------------------------------------------

export interface InvoicePrintData {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  customer: {
    name: string;
    mobile: string;
    address: string | null;
    state: string | null;
  };
}

function money(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function row(label: string, value: string, bold = false): string {
  return `<tr><td class="lbl">${label}</td><td class="val${bold ? " bold" : ""}">${value}</td></tr>`;
}

export function printInvoice({ invoice, items, customer }: InvoicePrintData): void {
  const win = window.open("", "_blank", "width=850,height=1000");
  if (!win) {
    alert("Popup blocked — allow popups for this site to print invoices.");
    return;
  }

  const totalMaterialDiscount = items.reduce((s, i) => s + i.material_discount, 0);
  const totalStoneDiscount = items.reduce((s, i) => s + i.stone_discount, 0);
  const totalLabourDiscount = items.reduce((s, i) => s + i.labour_discount, 0);

  const totalMaterialTaxable = items.reduce((s, i) => s + i.material_taxable_amount, 0);
  const totalLabourTaxable = items.reduce((s, i) => s + i.labour_taxable_amount, 0);

  const materialTaxLabel = invoice.is_interstate ? "IGST Material Charges Tax" : "SGST + CGST Material Charges Tax";
  const labourTaxLabel = invoice.is_interstate ? "IGST Labour Charges Tax" : "SGST + CGST Labour Charges Tax";
  const materialTax = items.reduce((s, i) => s + i.material_sgst + i.material_cgst, 0);
  const labourTax = items.reduce((s, i) => s + i.labour_sgst + i.labour_cgst, 0);

  const itemRows = items
    .map(
      (item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.barcode}</td>
      <td>${item.hsn_code ?? "—"}</td>
      <td>${item.sac_code ?? "—"}</td>
      <td>${item.description ?? "—"}</td>
      <td>${item.purity ?? "—"}</td>
      <td class="num">${item.billing_weight != null ? item.billing_weight.toFixed(3) : "—"}</td>
      <td class="num">${money(item.rate_per_gram)}</td>
      <td class="num">${money(item.gold_value)}</td>
      <td class="num">${money(item.stone_charges)}</td>
      <td class="num">${money(item.making_charge_amount)}</td>
    </tr>`
    )
    .join("");

  const paymentRows = (invoice.payments as PaymentLine[])
    .map((p) => `<tr><td class="lbl">${p.method}</td><td class="val">₹${money(p.amount)}</td></tr>`)
    .join("");

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${invoice.invoice_number}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 10pt; }
  .sheet { width: 100%; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1F3864; padding-bottom: 6mm; margin-bottom: 4mm; }
  .title { font-size: 18pt; font-weight: bold; letter-spacing: 1px; }
  .copy { font-size: 9pt; text-align: right; }
  .shop-name { font-size: 14pt; font-weight: bold; color: #1F3864; }
  .shop-line { font-size: 9pt; margin-top: 1mm; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  .meta-table td { padding: 1mm 2mm; font-size: 9.5pt; vertical-align: top; }
  .lbl { color: #5B6472; width: 45%; }
  .val { font-weight: 600; }
  .val.bold { font-weight: bold; }
  .two-col { display: flex; gap: 6mm; margin-bottom: 4mm; }
  .box { flex: 1; border: 1px solid #D9DCE1; border-radius: 2mm; padding: 3mm; }
  .box h4 { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; color: #5B6472; margin-bottom: 2mm; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  table.items th { background: #1F3864; color: #fff; font-size: 8pt; padding: 2mm 1.5mm; text-align: left; }
  table.items td { border-bottom: 1px solid #E3E5E8; padding: 1.8mm 1.5mm; font-size: 8.5pt; }
  table.items td.num, table.items th.num { text-align: right; }
  .charges-summary { display: flex; justify-content: flex-end; margin-bottom: 4mm; }
  .charges-summary table { width: 75mm; border-collapse: collapse; }
  .charges-summary td { padding: 1mm 2mm; font-size: 9.5pt; }
  .charges-summary .lbl { color: #5B6472; }
  .charges-summary .val { text-align: right; font-weight: 600; }
  .charges-summary tr.total td { border-top: 1.5px solid #1F3864; font-weight: bold; font-size: 11pt; padding-top: 2mm; }
  .words { margin: 4mm 0; font-size: 9.5pt; }
  .words b { color: #1F3864; }
  .footer-grid { display: flex; justify-content: space-between; margin-top: 8mm; font-size: 8.5pt; color: #5B6472; }
  .footer-grid div { max-width: 60%; }
  .sign-block { display: flex; justify-content: space-between; margin-top: 16mm; font-size: 9.5pt; }
  .sign-line { border-top: 1px solid #1a1a1a; width: 55mm; text-align: center; padding-top: 1.5mm; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="top">
      <div>
        <div class="title">TAX INVOICE</div>
        <div class="shop-name">${SHOP.name}</div>
        <div class="shop-line">${SHOP.tagline}</div>
        <div class="shop-line">${SHOP.addressLine}</div>
        <div class="shop-line">Ph: ${SHOP.phone} &nbsp;|&nbsp; ${SHOP.email}</div>
        <div class="shop-line">GSTIN: ${SHOP.gstin} &nbsp;|&nbsp; State: ${SHOP.state} (${SHOP.stateCode})</div>
      </div>
      <div class="copy">ORIGINAL</div>
    </div>

    <div class="two-col">
      <div class="box">
        <h4>Invoice Details</h4>
        <table class="meta-table">
          ${row("Invoice No.", invoice.invoice_number, true)}
          ${row("Date", formatDateTime(invoice.created_at))}
          ${row("Place of Supply", invoice.is_interstate ? `${customer.state ?? "—"} (Inter-state)` : `${SHOP.state} (Intra-state)`)}
        </table>
      </div>
      <div class="box">
        <h4>Billed To</h4>
        <table class="meta-table">
          ${row("Name", customer.name, true)}
          ${row("Mobile", customer.mobile)}
          ${row("Address", customer.address ?? "—")}
          ${row("State", customer.state ?? "—")}
        </table>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>#</th>
          <th>Stock Code</th>
          <th>HSN</th>
          <th>SAC</th>
          <th>Description</th>
          <th>Purity</th>
          <th class="num">Wt (g)</th>
          <th class="num">Rate/g</th>
          <th class="num">Gold Value</th>
          <th class="num">Stone Chgs</th>
          <th class="num">Making Chgs</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="charges-summary">
      <table>
        ${row("Material Charges (post-discount)", "₹" + money(totalMaterialTaxable))}
        ${row("Labour Charges (post-discount)", "₹" + money(totalLabourTaxable))}
        ${totalMaterialDiscount > 0 ? row("Less: Discount on Material Charges", "₹" + money(totalMaterialDiscount)) : ""}
        ${totalStoneDiscount > 0 ? row("Less: Discount on Stone Charges", "₹" + money(totalStoneDiscount)) : ""}
        ${totalLabourDiscount > 0 ? row("Less: Discount on Labour Charges", "₹" + money(totalLabourDiscount)) : ""}
        ${row(materialTaxLabel, "₹" + money(materialTax))}
        ${row(labourTaxLabel, "₹" + money(labourTax))}
        <tr class="total"><td class="lbl">Net Payable</td><td class="val">₹${money(invoice.grand_total)}</td></tr>
      </table>
    </div>

    <div class="words">
      <b>Total in Words:</b> ${rupeesToWords(invoice.grand_total)}
    </div>

    <div class="two-col">
      <div class="box">
        <h4>Mode of Payment</h4>
        <table class="meta-table">
          ${paymentRows}
        </table>
      </div>
      <div class="box">
        <h4>Bank Details</h4>
        <table class="meta-table">
          ${row("Bank", SHOP.bank.name)}
          ${row("A/c No.", SHOP.bank.accountNo)}
          ${row("IFSC", SHOP.bank.ifsc)}
        </table>
      </div>
    </div>

    <div class="sign-block">
      <div class="sign-line">Customer's Signature</div>
      <div class="sign-line">For ${SHOP.name}</div>
    </div>

    <div class="footer-grid">
      <div>${SHOP.jurisdiction}.</div>
      <div>This is a computer-generated tax invoice.</div>
    </div>
  </div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`);
  win.document.close();
}
