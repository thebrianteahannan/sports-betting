// What a member searches for in Build A Bet, sent once they stop typing, for Member Habits.
let searchHabitTimer = 0, searchHabitLast = "";

document.addEventListener("input", (event) => {
  const field = event.target;
  if (!field.matches || !field.matches(".find-board label.find input")) return;
  clearTimeout(searchHabitTimer);
  searchHabitTimer = setTimeout(() => {
    const q = field.value.replace(/\s+/g, " ").trim();
    if (q.length < 3 || q.toLowerCase() === searchHabitLast || typeof window.noteTaste !== "function") return;
    searchHabitLast = q.toLowerCase();
    window.noteTaste("search", { q });
  }, 2500);
});
