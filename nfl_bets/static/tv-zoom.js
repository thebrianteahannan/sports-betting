function tvZoomOpen() {
  const zoom = document.getElementById("tv-zoom");
  const card = document.getElementById("tv-zoom-card");
  const glass = document.getElementById("desk-glass");
  const desk = document.getElementById("desk");
  if (!zoom || !card || !glass || (desk && desk.classList.contains("tv-full")) || !zoom.hidden) return;
  card.append(glass);
  zoom.hidden = false;
  document.body.classList.add("tv-zoom-on");
}

function tvZoomShut() {
  const zoom = document.getElementById("tv-zoom");
  const glass = document.getElementById("desk-glass");
  const glow = document.getElementById("desk-glow");
  if (!zoom || zoom.hidden || !glass || !glow) return;
  zoom.hidden = true;
  glow.after(glass);
  document.body.classList.remove("tv-zoom-on");
}

window.tvZoomOpen = tvZoomOpen;
window.tvZoomShut = tvZoomShut;

document.getElementById("tv-zoom-open").addEventListener("click", (event) => { event.stopPropagation(); tvZoomOpen(); });
document.getElementById("tv-zoom-x").addEventListener("click", tvZoomShut);
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !document.getElementById("tv-zoom").hidden) tvZoomShut(); });
