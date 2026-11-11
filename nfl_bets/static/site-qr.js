/** Double-click the parrot in the top right to show a QR code for parlayoftheday.com on the TV. */

function siteQrShut() {
  const box = document.getElementById("site-qr");
  if (box) box.remove();
}

function siteQrShow() {
  const glass = document.getElementById("desk-glass");
  if (!glass) return;
  if (document.getElementById("site-qr")) return;
  const box = document.createElement("div");
  box.id = "site-qr";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "QR code for parlayoftheday.com");
  box.innerHTML = `<div class="site-qr-card"><button type="button" class="site-qr-close" aria-label="Close the QR code">×</button><img src="/scene/site-qr.svg?v=1" alt="QR code for parlayoftheday.com"><p class="site-qr-say">Scan to get Parlay on your phone.</p><p class="site-qr-url">parlayoftheday.com</p></div>`;
  box.addEventListener("click", (event) => { event.stopPropagation(); siteQrShut(); });
  glass.append(box);
}

document.addEventListener("DOMContentLoaded", () => {
  const menu = document.getElementById("desk-menu");
  if (menu) menu.addEventListener("dblclick", (event) => { event.preventDefault(); siteQrShow(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") siteQrShut(); });
});
