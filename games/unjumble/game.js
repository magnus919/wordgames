import * as kit from "../../js/game-kit.js";
export function validateGuess(word, state, puzzle, lexicons) {
  if (!/^[A-Z]{6}$/.test(word))
    return "Enter six English letters before guessing.";
  if (kit.signature(word) !== kit.signature(puzzle.answer))
    return "Use each tile exactly once. No turn used.";
  return kit.wordError(word, 6, lexicons.guesses, state.guesses);
}
const plugin = {
  apiVersion: 1,
  id: "unjumble",
  instructions: [
    "Rearrange all six tiles into an English word. The clue points to one possible answer; any approved English anagram wins.",
    "Tap tiles or type an answer. Shuffle freely and take your time—there’s no guess limit.",
    "An optional hint reveals the first letter of the clued word and is disclosed in your shared result.",
  ],
  initialState: () => ({ guesses: [], hints: 0 }),
  restoreState(raw, puzzle, lexicons) {
    const state = kit.restoreWordState(raw, {
      length: 6,
      attempts: 1,
      hints: 1,
      dictionary: lexicons.guesses,
    });
    state.guesses = state.guesses.filter((g) =>
      puzzle.accepted_answers.includes(g),
    );
    return state;
  },
  validatePuzzle(p, lexicons) {
    return (
      p?.language === "en" &&
      kit.isEnglishWord(p.answer, 6, lexicons.answers) &&
      Array.isArray(p.accepted_answers) &&
      p.accepted_answers.includes(p.answer) &&
      p.accepted_answers.every(
        (w) =>
          kit.isEnglishWord(w, 6, lexicons.guesses) &&
          kit.signature(w) === kit.signature(p.answer),
      ) &&
      [p.clue, p.note].every(
        (s) => typeof s === "string" && s.length >= 12 && s.length <= 240,
      )
    );
  },
  result(state, puzzle) {
    const answer = state.guesses.find((g) =>
        puzzle.accepted_answers.includes(g),
      ),
      won = !!answer;
    return {
      status: won ? "won" : "playing",
      score: won ? "Solved" : "Unsolved",
      hints: state.hints,
      graphic: won ? ["🟩"] : [],
      title: "Aha. There it is.",
      detail: `Untangled ${state.hints ? "with a little nudge" : "without hints"}.`,
      note: `${puzzle.answer.toLowerCase()} — ${puzzle.note}${answer && answer !== puzzle.answer ? ` Your alternative, ${answer.toLowerCase()}, is also an accepted English anagram.` : ""}`,
      strategy:
        "For next time: look for familiar pairs of letters, then let the clue guide you.",
    };
  },
  mount(ctx) {
    const { root, puzzle, lexicons, commit, setMessage, canPlay } = ctx;
    let state = ctx.state,
      draft = "",
      shuffles = 0,
      order = kit.scramble(puzzle.answer, ctx.number);
    const { surface, companion } = kit.layout(root),
      turn = kit.el("div", "turns", "One word. Take your time."),
      bank = kit.el("div", "tile-bank");
    bank.setAttribute("aria-label", "Letter tiles");
    const form = kit.inputForm("Your six-letter answer", 6, submit, (value) => {
      draft = value;
      renderBank(false);
    });
    const actions = kit.el("div", "jumble-actions"),
      shuffle = kit.button(
        "↻ Shuffle tiles",
        () => {
          if (!canPlay()) return;
          order = kit.scramble(puzzle.answer, ctx.number + ++shuffles * 37);
          renderBank(false);
          setMessage("Tiles shuffled. Your answer is unchanged.");
        },
        "quiet",
      ),
      clear = kit.button(
        "Clear answer",
        () => {
          if (!canPlay()) return;
          draft = "";
          form.input.value = "";
          renderBank(false);
          setMessage("Answer cleared. No turn used.");
          form.input.focus();
        },
        "quiet",
      );
    actions.append(shuffle, clear);
    const guide = kit.el("div");
    guide.append(
      kit.el("h2", "", "Start with meaning"),
      kit.el("p", "clue", puzzle.clue),
      kit.el(
        "p",
        "small",
        "Tap tiles or type. Each tile is used once. Shuffle as often as you like.",
      ),
    );
    const hints = kit.hints(
      [`The clued word begins with ${puzzle.answer[0]}.`],
      () => {
        if (canPlay() && state.hints < 1) commit({ ...state, hints: 1 });
      },
    );
    surface.append(turn, bank, form.form, ctx.feedback, actions);
    companion.append(guide, hints.panel);
    function submit(word) {
      if (!canPlay()) return;
      const error = validateGuess(word, state, puzzle, lexicons);
      if (error) {
        setMessage(error);
        form.input.setAttribute("aria-invalid", "true");
        return;
      }
      commit({ ...state, guesses: [word] });
    }
    function renderBank(complete) {
      const focused = bank.contains(document.activeElement);
      bank.replaceChildren();
      const used = {};
      for (const l of draft) used[l] = (used[l] || 0) + 1;
      for (const [i, l] of [...order].entries()) {
        const consumed = (used[l] || 0) > 0;
        if (consumed) used[l]--;
        const tile = kit.button(
          l,
          () => {
            if (!canPlay()) return;
            draft += l;
            form.input.value = draft;
            renderBank(false);
          },
          `jumble-tile${consumed ? " consumed" : ""}`,
        );
        tile.disabled = complete || consumed || draft.length >= 6;
        tile.setAttribute(
          "aria-label",
          `${l}, tile ${i + 1}${consumed ? ", used" : ""}`,
        );
        bank.append(tile);
      }
      if (focused && !complete)
        (
          bank.querySelector("button:not([disabled])") ||
          form.form.querySelector("button")
        ).focus({ preventScroll: true });
    }
    return {
      update(next, locked) {
        state = next;
        const complete =
          locked || plugin.result(state, puzzle).status === "won";
        turn.textContent = complete
          ? "Today’s puzzle complete"
          : "One word. Take your time.";
        renderBank(complete);
        form.form.hidden = complete;
        actions.hidden = complete;
        hints.update(state.hints, complete);
      },
    };
  },
};
export default plugin;
