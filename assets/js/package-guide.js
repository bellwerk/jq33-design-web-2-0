(() => {
  const root = document.querySelector("[data-package-guide]");
  const tool = root?.querySelector("[data-package-tool]");
  const button = root?.querySelector("[data-package-recommend]");
  const result = root?.querySelector("[data-package-result]");
  if (!root || !tool || !button || !result) return;

  const recommendations = {
    layout: {
      title: "Start with Layout Sprint — from $2,900 CAD",
      reason: "Your main question is how the space works. This scope focuses on zoning, circulation, and furniture or equipment placement before a broader visual package.",
    },
    concept: {
      title: "Start with Signature Interior — from $6,800 CAD",
      reason: "You want the visual decisions to work together. This scope brings layout, finish palette, lighting direction, and key views into a coordinated concept.",
    },
    handoff: {
      title: "Discuss the Contractor-Ready Package — from $12,500 CAD",
      reason: "You need more detailed design direction for contractor discussions. Confirm the drawing and specification list, site information, and any specialist requirements in the proposal.",
    },
  };

  tool.hidden = false;
  button.addEventListener("click", () => {
    const goal = root.querySelector('input[name="package-goal"]:checked')?.value;
    const recommendation = recommendations[goal];
    if (!recommendation) return;
    const heading = document.createElement("h3");
    heading.textContent = recommendation.title;
    const explanation = document.createElement("p");
    explanation.textContent = recommendation.reason;
    const action = document.createElement("a");
    action.href = "/inquiry/";
    action.textContent = "Discuss this scope with JQ33";
    result.replaceChildren(heading, explanation, action);
    result.hidden = false;
  });
})();
