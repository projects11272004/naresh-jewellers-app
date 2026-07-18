import JsBarcode from "jsbarcode";

// ---------------------------------------------------------------------------
// Printable jewellery tag - rat-tail style, matching the client's actual
// label stock: 15mm wide x 100mm long (the 100mm includes the long thin
// tail that wraps around the piece; only the first ~40mm or so is actually
// printed on). Content is laid out LEFT-TO-RIGHT along the 100mm length
// (not stacked top-to-bottom) because 15mm isn't tall enough to stack
// GW/NW/Pcs + barcode + code as separate rows - it fits comfortably as a
// single horizontal strip instead, which also matches the proportions in
// the client's reference photo (small printed flap, long blank tail).
//
// If the client's actual tags turn out to need different dimensions later,
// only these two constants need to change.
// ---------------------------------------------------------------------------
const LABEL_WIDTH_MM = 100; // length, including the blank tail
const LABEL_HEIGHT_MM = 15; // width of the flap

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
    height: 34,
  });
  const barcodeSvg = svgHolder.outerHTML;

  const win = window.open("", "_blank", "width=520,height=260");
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
    padding: 0 1.2mm;
    display: flex;
    align-items: center;
    overflow: hidden;
  }
  /* Printed content only occupies the left portion of the tag; the rest
     (the tail) is deliberately left blank. */
  .textblock {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.3mm;
    margin-right: 2mm;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .row { font-size: 5pt; font-weight: bold; line-height: 1.15; }
  .barcodeblock {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    flex-shrink: 0;
  }
  .barcode svg { height: 9mm; display: block; }
  .code { font-size: 5pt; font-weight: bold; letter-spacing: 0.15mm; margin-top: 0.3mm; }
</style>
</head>
<body>
  <div class="tag">
    <div class="textblock">
      ${line("GW", tag.grossWeight != null ? tag.grossWeight.toFixed(3) : null)}
      ${line("NW", tag.netWeight != null ? tag.netWeight.toFixed(3) : null)}
      ${line("Pcs", tag.stonePieces != null ? String(tag.stonePieces) : null)}
    </div>
    <div class="barcodeblock">
      <div class="barcode">${barcodeSvg}</div>
      <div class="code">${tag.barcode}</div>
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
