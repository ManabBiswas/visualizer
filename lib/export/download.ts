function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "codelens";
}

export function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Natural diagram size: viewBox first (unaffected by CSS/zoom), then width/
// height attributes, then the rendered rect as a last resort.
function svgSize(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { w: vb.width, h: vb.height };
  const w = parseFloat(svg.getAttribute("width") ?? "");
  const h = parseFloat(svg.getAttribute("height") ?? "");
  if (w > 0 && h > 0) return { w, h };
  const rect = svg.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function prepareSvg(svg: SVGSVGElement): { source: string; w: number; h: number } {
  const { w, h } = svgSize(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  // Mermaid sets max-width styles that would shrink the rasterized output.
  clone.style.maxWidth = "";
  const source = new XMLSerializer().serializeToString(clone);
  return { source, w, h };
}

export function downloadSvg(svg: SVGSVGElement, name: string) {
  const { source } = prepareSvg(svg);
  downloadText(source, `${sanitizeFilename(name)}.svg`, "image/svg+xml");
}

export function downloadPng(svg: SVGSVGElement, name: string, background = "#10141a"): Promise<void> {
  const { source, w, h } = prepareSvg(svg);
  const svgUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  const scale = 2;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(w * scale);
        canvas.height = Math.ceil(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable.");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(svgUrl);
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("PNG encoding failed."));
            return;
          }
          const url = URL.createObjectURL(blob);
          triggerDownload(url, `${sanitizeFilename(name)}.png`);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          resolve();
        }, "image/png");
      } catch (err) {
        URL.revokeObjectURL(svgUrl);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error("Could not rasterize the diagram."));
    };
    img.src = svgUrl;
  });
}
