/** Close calls on the Strategies page: stacks that missed a cutoff by a little, with the cutoff they missed. */

function closeCalls(board, near) {
  board.querySelectorAll(".rec-strategy").forEach((block) => {
    const stacks = near[block.dataset.name] || [];
    block.querySelectorAll(":scope > .stack-close").forEach((node) => node.remove());
    if (!stacks.length) return;
    const box = document.createElement("div");
    box.className = "stack-close";
    const go = document.createElement("button");
    go.type = "button";
    go.className = "stack-close-go";
    const label = `Close calls (${stacks.length})`;
    go.textContent = label;
    go.setAttribute("aria-expanded", "false");
    box.append(go);
    go.addEventListener("click", (event) => {
      event.stopPropagation();
      const open = go.getAttribute("aria-expanded") !== "true";
      go.setAttribute("aria-expanded", open ? "true" : "false");
      go.textContent = open ? "Hide close calls" : label;
      box.querySelectorAll(":scope > .stack-set").forEach((node) => node.remove());
      if (!open) return;
      stacks.forEach((stack) => {
        const set = document.createElement("div");
        set.className = "stack-set stack-near";
        const miss = document.createElement("p");
        miss.className = "stack-near-miss";
        miss.textContent = stack.miss;
        const name = document.createElement("p");
        name.className = "stack-set-name";
        name.textContent = stackName(stack);
        set.append(miss, name);
        stackRead(set, stack);
        stackLegs(stack).forEach((bet) => set.append(stackLeg(bet)));
        box.append(set);
      });
    });
    block.append(box);
  });
}

window.closeCalls = closeCalls;
