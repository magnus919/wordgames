import * as kit from "../../js/game-kit.js";
export function validateGuess(word, state, puzzle, lexicons) {
  return kit.wordError(word, 5, lexicons.guesses, state.guesses);
}
const plugin = {
  apiVersion: 1,
  id: "fivefold",
  instructions: [
    "Find a five-letter English word in six guesses. Colors and symbols show which letters belong and where.",
    "A gray duplicate can mean the word has fewer copies of that letter. Invalid or repeated guesses never use a turn.",
    "Optional hints reveal a clue, then the first letter. Their use appears in shared results.",
  ],
  initialState: () => ({ guesses: [], hints: 0, hintIndex: null }),
  restoreState(raw, puzzle, lexicons) {
    const state = kit.restoreWordState(raw, {
      length: 5,
      attempts: 6,
      hints: 2,
      dictionary: lexicons.guesses,
    });
    return {
      ...state,
      hintIndex:
        state.hints > 1
          ? Number.isInteger(raw?.hintIndex) &&
            raw.hintIndex >= 0 &&
            raw.hintIndex < 5
            ? raw.hintIndex
            : 0
          : null,
    };
  },
  validatePuzzle(p, lexicons) {
    return (
      p?.language === "en" &&
      kit.isEnglishWord(p.answer, 5, lexicons.answers) &&
      lexicons.guesses.includes(p.answer) &&
      [p.clue, p.note].every(
        (s) => typeof s === "string" && s.length >= 12 && s.length <= 240,
      )
    );
  },
  result(state, puzzle) {
    const won = state.guesses.includes(puzzle.answer),
      complete = won || state.guesses.length >= 6;
    return {
      status: won ? "won" : complete ? "lost" : "playing",
      score: `${won ? state.guesses.length : "X"}/6`,
      hints: state.hints,
      graphic: state.guesses.map((g) =>
        kit
          .scoreLetters(g, puzzle.answer)
          .map((m) => kit.squares[m])
          .join(""),
      ),
      title: won ? "Aha. There it is." : "A word for next time.",
      detail: `${won ? "Solved" : "Finished"} in ${state.guesses.length} ${state.guesses.length === 1 ? "guess" : "guesses"}${state.hints ? `, with ${state.hints} hint${state.hints === 1 ? "" : "s"}` : ", without hints"}.`,
      note: `${puzzle.answer.toLowerCase()} — ${puzzle.note}`,
      strategy:
        "For next time: try a word with new letters when you need more evidence.",
    };
  },
  mount(ctx) {
    const { root, puzzle, lexicons, commit, setMessage, signal, canPlay } = ctx;
    let state = ctx.state,
      draft = "";
    const { surface, companion } = kit.layout(root),
      turns = kit.el("div", "turns"),
      label = kit.el("span"),
      dots = kit.el("div", "turn-dots");
    turns.append(label, dots);
    const board = kit.letterBoard(6, 5),
      known = kit.el("div", "constraints");
    known.setAttribute("aria-live", "polite");
    const form = kit.inputForm("Your five-letter guess", 5, submit, (value) => {
      draft = value;
      board.update(state.guesses, draft, puzzle.answer, false);
    });
    const hintSteps = [puzzle.clue, ""],
      kb = kit.keyboard(type),
      hints = kit.hints(hintSteps, () => {
        if (!canPlay() || state.hints >= 2) return;
        let index = null;
        if (state.hints === 1) {
          const fixed = Array(5).fill(false);
          for (const guess of state.guesses)
            kit.scoreLetters(guess, puzzle.answer).forEach((m, i) => {
              if (m === "correct") fixed[i] = true;
            });
          index = fixed.indexOf(false);
          if (index === -1) {
            setMessage(
              "You’ve already found all five positions. Put the letters together.",
            );
            return;
          }
        }
        commit({ ...state, hints: state.hints + 1, hintIndex: index });
      });
    const alternate = kit.el("details", "input-alternative"),
      summary = kit.el("summary", "", "Type a guess instead");
    alternate.append(summary, form.form);
    surface.classList.add("deduction-surface");
    surface.append(turns, board.board, ctx.feedback, kb.root, alternate);
    companion.append(kit.legend(), known, hints.panel);
    function submit(value) {
      if (!canPlay()) return;
      const error = validateGuess(value, state, puzzle, lexicons);
      if (error) {
        setMessage(error);
        form.input.setAttribute("aria-invalid", "true");
        return;
      }
      draft = "";
      form.input.value = "";
      setMessage(
        kit
          .scoreLetters(value, puzzle.answer)
          .map(
            (m, i) =>
              `${value[i]}: ${m === "present" ? "another position" : m}`,
          )
          .join(". "),
      );
      commit({ ...state, guesses: [...state.guesses, value] });
    }
    function type(l) {
      if (!canPlay()) return;
      if (l === "↵") {
        submit(draft);
        return;
      }
      if (l === "⌫") draft = draft.slice(0, -1);
      else if (/^[A-Z]$/.test(l) && draft.length < 5) draft += l;
      form.input.value = draft;
      form.input.removeAttribute("aria-invalid");
      board.update(state.guesses, draft, puzzle.answer, false);
    }
    window.addEventListener(
      "keydown",
      (e) => {
        if (
          document.querySelector("dialog[open]") ||
          e.ctrlKey ||
          e.metaKey ||
          e.altKey ||
          ["INPUT", "TEXTAREA"].includes(e.target.tagName) ||
          (["A", "BUTTON", "SUMMARY"].includes(e.target.tagName) &&
            !e.target.classList.contains("key") &&
            ["Enter", " "].includes(e.key))
        )
          return;
        const l =
          e.key === "Enter"
            ? "↵"
            : e.key === "Backspace"
              ? "⌫"
              : e.key.toUpperCase();
        if (/^[A-Z]$/.test(l) || ["↵", "⌫"].includes(l)) {
          e.preventDefault();
          type(l);
        }
      },
      { signal },
    );
    return {
      update(next, locked) {
        state = next;
        const complete =
            locked || plugin.result(state, puzzle).status !== "playing",
          remaining = 6 - state.guesses.length;
        label.textContent = complete
          ? "Today’s puzzle complete"
          : `${remaining} ${remaining === 1 ? "guess" : "guesses"} remaining`;
        dots.replaceChildren(
          ...Array.from({ length: 6 }, (_, i) =>
            kit.el("span", i < state.guesses.length ? "used" : ""),
          ),
        );
        board.update(state.guesses, draft, puzzle.answer, complete);
        kb.update(state.guesses, puzzle.answer, complete);
        alternate.hidden = complete;
        form.form.hidden = complete;
        hintSteps[1] = `Letter ${(state.hintIndex ?? 0) + 1} is ${puzzle.answer[state.hintIndex ?? 0]}.`;
        hints.update(state.hints, complete);
        known.replaceChildren();
        if (state.guesses.length && !complete) {
          const fixed = Array(5).fill(""),
            present = new Set();
          for (const g of state.guesses)
            kit.scoreLetters(g, puzzle.answer).forEach((m, i) => {
              if (m === "correct") fixed[i] = g[i];
              if (m === "present") present.add(g[i]);
            });
          known.append(kit.el("h2", "", "What you know"));
          const pattern = kit.el(
            "p",
            "known-pattern",
            fixed.map((l) => l || "＿").join(" "),
          );
          pattern.setAttribute(
            "aria-label",
            fixed
              .map((l, i) => `Position ${i + 1}: ${l || "unknown"}`)
              .join(", "),
          );
          known.append(pattern);
          const movable = [...present].filter((l) => !fixed.includes(l));
          if (movable.length)
            known.append(
              kit.el(
                "p",
                "small",
                `Also in the word: ${movable.join(", ")}. Try a different position.`,
              ),
            );
        }
      },
    };
  },
};
export default plugin;
