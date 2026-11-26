/** Admin only: props still on the early price, ahead of a clock the price log has seen before. */

function priceTrendFill(host, data) {
  host.replaceChildren();
  const early = (data && data.early) || [];
  const trends = (data && data.trends) || [];
  const waits = trends.filter((row) => row.way === "longer");
  const clocks = early.length ? waits : trends;
  const lead = document.createElement("p");
  lead.className = "price-move-lead";
  lead.textContent = early.length ? "Bet these before FanDuel reprices them." : clocks.length ? "These clocks have shown up more than once." : (data && data.say) || "";
  if (!lead.textContent) { host.remove(); return; }
  host.append(lead);
  early.forEach((row) => {
    const line = document.createElement("p");
    line.className = "price-trend-bet";
    line.textContent = row.say || "";
    host.append(line);
  });
  clocks.forEach((row) => {
    const line = document.createElement("p");
    line.className = "price-trend-clock";
    line.textContent = row.say || "";
    host.append(line);
  });
}

function priceTrendPaint(box) {
  if (!box || box.querySelector(".price-trend")) return;
  const go = () => {
    if (!(window.memberAdmin || (window.state && window.state.admin))) return false;
    const host = document.createElement("div");
    host.className = "price-trend";
    const wait = document.createElement("p");
    wait.className = "price-trend-clock";
    wait.textContent = "Looking through the price log.";
    host.append(wait);
    box.prepend(host);
    fetch("/api/price-trends", { credentials: "same-origin" }).then((response) => (response.ok ? response.json() : null)).then((data) => {
      if (host.isConnected) priceTrendFill(host, data);
    }).catch(() => {});
    return true;
  };
  if (!go()) setTimeout(() => { if (box.isConnected && !box.querySelector(".price-trend")) go(); }, 1500);
}

window.priceTrendPaint = priceTrendPaint;
