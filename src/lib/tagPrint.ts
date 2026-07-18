import JsBarcode from "jsbarcode";

// ---------------------------------------------------------------------------
// Printable jewellery tag (rat-tail style, like the RL7030 sample).
//
// ADJUST THESE TWO NUMBERS to the measured white printable flap of your
// actual tags (width × height in millimetres, of just the rectangular part
// that gets printed — not the thin tail). Once the client measures the real
// tags, set these and the layout will match exactly.
// ---------------------------------------------------------------------------
const LABEL_WIDTH_MM = 32;
const LABEL_HEIGHT_MM = 22;

export interface TagData {
  barcode: string; // e.g. NJ00001 — encoded as Code 128
  grossWeight: number | null;
  netWeight: number | null;
  stonePieces: number | null; // printed as "Pcs" only when present
}

function line(label: string, value: string | null): string {
  if (value == null) return "";
  return `<div class="row"><span>${label}</span> : <span>${value}</span></div>`;
}

/**
 * Opens a small window containing the tag laid out at exact mm dimensions
 * and triggers the browser print dialog. Select the label printer there.
 */
export function printTag(tag: TagData): void {
  // Render the Code 128 barcode to an SVG string first, in this window.
  const svgHolder = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  JsBarcode(svgHolder, tag.barcode, {
    format: "CODE128",
    displayValue: false,
    margin: 0,
    height: 30,
  });
  const barcodeSvg = svgHolder.outerHTML;

  const win = window.open("", "_blank", "width=420,height=360");
  if (!win) {
    alert("Popup blocked — allow popups for this site to print tags.");
    return;
  }

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Tag ${tag.barcode}</title>
<style>
  @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .tag {
    width: ${LABEL_WIDTH_MM}mm;
    height: ${LABEL_HEIGHT_MM}mm;
    padding: 0.8mm 1mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .row { font-size: 5.4pt; font-weight: bold; line-height: 1.25; white-space: nowrap; }
  .barcode { width: 100%; }
  .barcode svg { width: 100%; height: 7mm; display: block; }
  .code { font-size: 5.4pt; font-weight: bold; letter-spacing: 0.2mm; }
</style>
</head>
<body>
  <div class="tag">
    <div>
      ${line("GW", tag.grossWeight != null ? tag.grossWeight.toFixed(3) : null)}
      ${line("NW", tag.netWeight != null ? tag.netWeight.toFixed(3) : null)}
      ${line("Pcs", tag.stonePieces != null ? String(tag.stonePieces) : null)}
    </div>
    <div class="barcode">${barcodeSvg}</div>
    <div class="code">${tag.barcode}</div>
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
