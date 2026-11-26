/** Admin only: three sentences on the price clocks, and the deep dive as a PDF on the page. */

function priceTrendBrief(data) {
  if (data && Array.isArray(data.brief) && data.brief.filter(Boolean).length >= 3) return data.brief.slice(0, 3);
  const looked = (data && data.looked) || {};
  const trends = (data && data.trends) || [];
  const early = (data && data.early) || [];
  const count = (n) => Number(n || 0).toLocaleString("en-US");
  const first = `${count(looked.steps)} reprices across ${count(looked.games)} games.`;
  const raw = trends[0] && trends[0].say ? trends[0].say : (data && data.say) || "Nothing has landed on the same clock yet.";
  const bit = String(raw).split(/(?<=[.!?])\s/)[0].trim();
  const second = /[.!?]$/.test(bit) ? bit : `${bit}.`;
  let third = "No open price is still ahead of its clock.";
  if (early[0]) {
    const price = Number(early[0].odds);
    const shown = Number.isFinite(price) && price ? (price > 0 ? `+${price}` : `−${Math.abs(price)}`) : "";
    third = shown ? `${early[0].label} is still ${shown}.` : `${early[0].label} is still the early price.`;
  }
  return [first, second, third];
}

function priceTrendPdf(data) {
  const plain = (text) => String(text || "").replace(/[−–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E]/g, "");
  const escape = (text) => plain(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const wrap = (text, max) => {
    const lines = [];
    String(text || "").split(/\s+/).filter(Boolean).forEach((word) => {
      const last = lines[lines.length - 1];
      if (!last || `${last} ${word}`.length > max) lines.push(word);
      else lines[lines.length - 1] = `${last} ${word}`;
    });
    return lines.length ? lines : [""];
  };
  const pages = [];
  let cmds = [];
  let y = 740;
  const next = () => { if (cmds.length) pages.push(cmds); cmds = []; y = 740; };
  const ink = (color) => { cmds.push(`${color} rg`); };
  const text = (x, yy, str, size, font, color) => {
    ink(color || "0.12 0.14 0.18");
    cmds.push(`BT /${font || "F1"} ${size} Tf ${x.toFixed ? x.toFixed(1) : x} ${yy.toFixed ? yy.toFixed(1) : yy} Td (${escape(str)}) Tj ET`);
  };
  const write = (line, size, gap, max, font, color) => {
    wrap(line, max).forEach((bit) => {
      if (y < 54) next();
      text(54, y, bit, size, font, color);
      y -= gap;
    });
  };
  const heading = (line) => { if (y < 90) next(); y -= 6; write(line, 14, 20, 60, "F2", "0.08 0.28 0.18"); };
  const dive = data && data.dive;
  const when = new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  write("Price clocks", 18, 22, 40, "F2", "0.08 0.22 0.16");
  write(`${when} ET`, 10, 16, 80, "F1", "0.35 0.38 0.42");
  heading("Do this");
  priceTrendBrief(data).forEach((line) => write(line, 12, 16, 78, "F2", "0.1 0.12 0.16"));
  y -= 4;
  if (dive && dive.now && dive.now.length > 1) dive.now.forEach((line) => write(line, 11, 15, 86));
  (dive && dive.waits || []).forEach((line) => write(line, 11, 15, 86));
  if (!dive) {
    y -= 6;
    write("Clocks", 14, 20, 70, "F2");
    ((data && data.trends) || []).forEach((row) => write(row.say || "", 11, 15, 86));
    if (!((data && data.trends) || []).length) write((data && data.say) || "Nothing has landed on the same clock yet.", 11, 15, 86);
    const early = (data && data.early) || [];
    y -= 6;
    write("Still the early price", 14, 20, 70, "F2");
    if (!early.length) write("No open price is still ahead of its clock.", 11, 15, 86);
    early.forEach((row) => write(row.say || "", 11, 15, 86));
  }
  const sports = (dive && dive.sports) || [];
  const leaned = sports.some((sport) => sport.bars.some((bar) => bar.games >= 4 && Math.abs(bar.points) >= 0.5));
  if (dive && dive.lean) { heading("From the first price to the close"); write(dive.lean, 11, 15, 86); }
  if (leaned) {
    heading("When the first price finishes");
    write("Green finishes shorter. Red finishes longer. The bar is the typical trip, in points. A window needs 4 games before it is drawn.", 10, 13, 92, "F1", "0.35 0.38 0.42");
    y -= 8;
    const rowH = 34;
    if (y - sports.length * rowH < 70) next();
    const left = 108;
    const width = 440;
    const slot = width / 7;
    const maxPts = Math.max(1, ...sports.flatMap((sport) => sport.bars.map((bar) => Math.abs(bar.points) || 0)));
    const top = y;
    sports.forEach((sport, index) => {
      const mid = top - index * rowH - rowH / 2;
      text(54, mid - 3, sport.sport, 9, "F1", "0.15 0.17 0.2");
      cmds.push(`0.75 0.76 0.78 RG 0.6 w ${left} ${mid.toFixed(1)} m ${left + width} ${mid.toFixed(1)} l S`);
      sport.bars.forEach((bar, slotIndex) => {
        if (bar.games < 4 || !bar.points) return;
        const h = Math.max(2, (Math.abs(bar.points) / maxPts) * (rowH / 2 - 6));
        const x = left + slotIndex * slot + 3;
        const w = Math.max(4, slot - 8);
        const yy = bar.points > 0 ? mid : mid - h;
        cmds.push(`${bar.points > 0 ? "0.12 0.55 0.32" : "0.72 0.22 0.16"} rg ${x.toFixed(1)} ${yy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)} re f`);
      });
    });
    y = top - sports.length * rowH - 2;
    sports[0].bars.forEach((bar, index) => text(left + index * slot, y, bar.label, 8, "F1", "0.35 0.38 0.42"));
    y -= 18;
    sports.forEach((sport) => { if (sport.line) write(sport.line, 11, 15, 86); });
  }
  const clocks = (dive && dive.clocks) || [];
  if (clocks.length) {
    heading("Where the price moves");
    write("The bar is the typical move, in points.", 10, 14, 80, "F1", "0.35 0.38 0.42");
    const maxPts = Math.max(1, ...clocks.map((clock) => Math.abs(clock.points) || 0));
    clocks.forEach((clock) => {
      if (y < 64) next();
      const w = Math.max(2, 170 * Math.abs(clock.points) / maxPts);
      const color = clock.faded ? "0.62 0.64 0.66" : clock.way === "shorter" ? "0.12 0.55 0.32" : "0.72 0.22 0.16";
      cmds.push(`${color} rg 54 ${y.toFixed(1)} ${w.toFixed(1)} 8 re f`);
      text(236, y, clock.title, 8, "F1", "0.15 0.17 0.2");
      y -= 14;
    });
    y -= 8;
    heading("The clocks");
    clocks.forEach((clock) => {
      if (y < 130) next();
      write(clock.title, 12, 16, 70, "F2", "0.1 0.12 0.16");
      const width = 160;
      const fill = Math.max(2, width * (clock.agree / Math.max(clock.games, 1)));
      const color = clock.way === "shorter" ? "0.12 0.55 0.32" : "0.72 0.22 0.16";
      cmds.push(`0.9 0.91 0.92 rg 54 ${y.toFixed(1)} ${width} 8 re f`);
      cmds.push(`${color} rg 54 ${y.toFixed(1)} ${fill.toFixed(1)} 8 re f`);
      text(224, y, `${clock.agree} of ${clock.games}`, 9, "F1", "0.25 0.28 0.32");
      y -= 16;
      write(clock.line, 11, 14, 86);
      write(clock.action, 11, 15, 86, "F2");
      const path = (clock.path || []).filter((bar) => bar.games >= 4 && bar.points);
      if (path.length && y > 80) {
        const peak = Math.max(1, ...clock.path.map((bar) => Math.abs(bar.points) || 0));
        clock.path.forEach((bar, index) => {
          const x = 54 + index * 28;
          if (bar.games >= 4 && bar.points) {
            const h = Math.max(2, (Math.abs(bar.points) / peak) * 12);
            const yy = bar.points > 0 ? y : y - h;
            cmds.push(`${bar.points > 0 ? "0.12 0.55 0.32" : "0.72 0.22 0.16"} rg ${x} ${yy.toFixed(1)} 16 ${h.toFixed(1)} re f`);
          }
          text(x, y - 20, bar.label, 7, "F1", "0.4 0.42 0.45");
        });
        y -= 32;
      }
      y -= 6;
    });
  }
  if (dive && dive.read) {
    heading("How this was read");
    write(dive.read, 11, 15, 86);
    if (dive.miss) write(dive.miss, 11, 15, 86);
  }
  if (cmds.length) pages.push(cmds);
  pages.forEach((list, index) => {
    list.push("0.45 0.48 0.52 rg");
    list.push(`BT /F1 9 Tf 54 32 Td (Price clocks) Tj ET`);
    list.push(`BT /F1 9 Tf 540 32 Td (${index + 1}) Tj ET`);
  });
  const objects = [];
  const add = (body) => { objects.push(body); return objects.length; };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const bold = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  const kids = pages.map((list) => {
    const stream = list.join("\n");
    const contents = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(`<< /Type /Page /Parent PAGES /MediaBox [0 0 612 792] /Contents ${contents} 0 R /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> >>`);
  });
  const pagesId = add(`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] >>`);
  objects.forEach((obj, index) => { objects[index] = obj.replaceAll("PAGES", `${pagesId} 0 R`); });
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R /PageMode /UseNone >>`);
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((at) => { body += `${String(at).padStart(10, "0")} 00000 n \n`; });
  body += `trailer << /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

function priceTrendFill(host, data) {
  host.replaceChildren();
  host.open = false;
  const lines = priceTrendBrief(data);
  if (!lines[0]) { host.remove(); return; }
  const summary = document.createElement("summary");
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.className = "price-trend-bet";
    p.textContent = line;
    summary.append(p);
  });
  const button = document.createElement("button");
  button.type = "button";
  button.className = "price-trend-pdf";
  button.textContent = "View the PDF";
  const frame = document.createElement("iframe");
  frame.className = "price-trend-frame";
  frame.hidden = true;
  frame.title = "Price clocks";
  const src = () => { if (!frame.src) frame.src = `${URL.createObjectURL(new Blob([priceTrendPdf(data)], { type: "application/pdf" }))}#toolbar=0&navpanes=0&view=Fit`; };
  const fit = () => {
    if (frame.hidden) return;
    const box = host.closest(".price-moves");
    if (box) box.classList.add("price-moves-pdf");
    host.classList.add("price-trend-open");
    const top = Math.max(0, frame.getBoundingClientRect().top);
    frame.style.height = `${Math.max(360, Math.round(window.innerHeight - top - 8))}px`;
  };
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (host.open && !frame.hidden) {
      frame.hidden = true;
      host.open = false;
      host.classList.remove("price-trend-open");
      const box = host.closest(".price-moves");
      if (box) box.classList.remove("price-moves-pdf");
      frame.style.height = "";
      button.textContent = "View the PDF";
      return;
    }
    src();
    frame.hidden = false;
    host.open = true;
    button.textContent = "Hide the PDF";
    requestAnimationFrame(fit);
  });
  window.addEventListener("resize", fit);
  summary.addEventListener("click", (event) => { event.preventDefault(); });
  summary.append(button);
  host.append(summary, frame);
}

function priceTrendPaint(box) {
  if (!box || box.querySelector(".price-trend")) return;
  const go = () => {
    if (!(window.memberAdmin || (window.state && window.state.admin))) return false;
    const host = document.createElement("details");
    host.className = "price-trend";
    const head = document.createElement("summary");
    head.textContent = "Price clocks";
    const wait = document.createElement("p");
    wait.className = "price-trend-clock";
    wait.textContent = "Looking through the price log.";
    host.append(head, wait);
    box.prepend(host);
    fetch("/api/price-trends", { credentials: "same-origin" }).then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (host.isConnected) priceTrendFill(host, data);
    }).catch(() => {});
    return true;
  };
  if (!go()) setTimeout(() => { if (box.isConnected && !box.querySelector(".price-trend")) go(); }, 1500);
}

window.priceTrendPaint = priceTrendPaint;
