// Reusable helpers: no game IDs, global state, persistence or network calls.
export const signature = (word) => word.split("").sort().join("");
export const isEnglishWord = (word, length, dictionary) =>
  typeof word === "string" &&
  new RegExp(`^[A-Z]{${length}}$`).test(word) &&
  dictionary.includes(word);
export function scoreLetters(guess, answer) {
  const marks = Array(answer.length).fill("absent"),
    remaining = answer.split("");
  for (let i = 0; i < answer.length; i++)
    if (guess[i] === answer[i]) {
      marks[i] = "correct";
      remaining[i] = null;
    }
  for (let i = 0; i < answer.length; i++)
    if (marks[i] !== "correct") {
      const j = remaining.indexOf(guess[i]);
      if (j !== -1) {
        marks[i] = "present";
        remaining[j] = null;
      }
    }
  return marks;
}
export function scramble(word, seed) {
  const letters = word.split("");
  let n = seed >>> 0;
  for (let i = letters.length - 1; i > 0; i--) {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    const j = n % (i + 1);
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const result = letters.join("");
  return result === word ? word.slice(1) + word[0] : result;
}
export function restoreWordState(raw, { length, attempts, hints, dictionary }) {
  return {
    guesses: Array.isArray(raw?.guesses)
      ? raw.guesses
          .filter((g) => isEnglishWord(g, length, dictionary))
          .slice(0, attempts)
      : [],
    hints: Number.isInteger(raw?.hints)
      ? Math.max(0, Math.min(raw.hints, hints))
      : 0,
  };
}
export function wordError(word, length, dictionary, previous = []) {
  if (!new RegExp(`^[A-Z]{${length}}$`).test(word))
    return `Enter ${length} English letters before guessing.`;
  if (previous.includes(word))
    return "You already tried that word. No turn used.";
  if (!dictionary.includes(word))
    return "That word isn’t in our English word list. No turn used.";
  return "";
}
export const symbols = { correct: "✓", present: "•", absent: "×" };
export const squares = { correct: "🟩", present: "🟨", absent: "⬜" };
export function el(tag, className = "", text) {
  const e = document.createElement(tag);
  e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
export function button(text, onClick, className = "secondary") {
  const b = el("button", className, text);
  b.type = "button";
  b.onclick = onClick;
  return b;
}
export function inputForm(label, length, onSubmit, onInput) {
  const form = el("form", "guess-form");
  form.noValidate = true;
  const l = el("label", "", label),
    input = el("input"),
    row = el("div", "answer-row"),
    submit = el("button", "primary", "Try word");
  input.id = `guess-input`;
  input.autocomplete = "off";
  input.autocapitalize = "characters";
  input.spellcheck = false;
  input.maxLength = length;
  input.inputMode = "text";
  input.setAttribute("aria-label", label);
  input.setAttribute("aria-describedby", "message");
  l.htmlFor = input.id;
  input.oninput = () => {
    input.value = input.value
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, length);
    input.removeAttribute("aria-invalid");
    onInput(input.value);
  };
  submit.type = "submit";
  form.onsubmit = (e) => {
    e.preventDefault();
    onSubmit(input.value.toUpperCase().trim());
  };
  row.append(input, submit);
  form.append(l, row);
  return { form, input };
}
export function hints(steps, onReveal) {
  const panel = el("div", "hint-panel"),
    title = el("h2", "", "A little nudge?"),
    note = el(
      "p",
      "small",
      "Hints are optional. Your shared result shows when you used one.",
    ),
    revealed = el("div");
  revealed.setAttribute("aria-live", "polite");
  const reveal = button("Reveal a hint", onReveal);
  panel.append(title, note, reveal, revealed);
  return {
    panel,
    update(used, complete) {
      panel.hidden = complete;
      reveal.disabled = used >= steps.length;
      reveal.textContent =
        used >= steps.length
          ? "All hints revealed"
          : used
            ? "Reveal one letter"
            : "Reveal a hint";
      revealed.replaceChildren(
        ...steps.slice(0, used).map((text) => el("p", "hint-text", text)),
      );
    },
  };
}
export function letterBoard(rows, length) {
  const board = el("div", "letter-board");
  return {
    board,
    update(guesses, draft, answer, complete) {
      board.replaceChildren();
      for (let i = 0; i < rows; i++) {
        const guess = guesses[i],
          active = !complete && i === guesses.length,
          text = guess || (active ? draft : ""),
          score = guess ? scoreLetters(guess, answer) : [];
        const row = el("div", `guess-row${active ? " current" : ""}`);
        row.setAttribute(
          "aria-label",
          `Guess ${i + 1}${guess ? ": " + guess : ""}`,
        );
        for (let j = 0; j < length; j++) {
          const tile = el("span", `tile ${score[j] || ""}`);
          tile.append(el("span", "letter", text[j] || ""));
          if (score[j]) {
            tile.append(el("span", "mark", symbols[score[j]]));
            tile.setAttribute(
              "aria-label",
              `${text[j]}: ${score[j] === "present" ? "in another position" : score[j]}`,
            );
          }
          row.append(tile);
        }
        board.append(row);
      }
    },
  };
}
export function keyboard(onKey) {
  const root = el("div", "keyboard"),
    keys = new Map();
  root.setAttribute("aria-label", "On-screen keyboard");
  for (const letters of ["QWERTYUIOP", "ASDFGHJKL", "↵ZXCVBNM⌫"]) {
    const row = el("div", "key-row");
    for (const l of letters) {
      const key = button(
        l === "↵" ? "Enter" : l,
        () => onKey(l),
        `key ${"↵⌫".includes(l) ? "wide" : ""}`,
      );
      keys.set(l, key);
      row.append(key);
    }
    root.append(row);
  }
  return {
    root,
    update(guesses, answer, complete) {
      root.hidden = complete;
      const ranks = { absent: 1, present: 2, correct: 3 },
        states = {};
      for (const g of guesses)
        scoreLetters(g, answer).forEach((m, i) => {
          if ((ranks[states[g[i]]] || 0) < ranks[m]) states[g[i]] = m;
        });
      for (const [l, key] of keys) {
        key.className = `key ${states[l] || ""} ${"↵⌫".includes(l) ? "wide" : ""}`;
        key.replaceChildren(document.createTextNode(l === "↵" ? "Enter" : l));
        if (states[l]) key.append(el("span", "key-mark", symbols[states[l]]));
        key.setAttribute(
          "aria-label",
          l === "⌫"
            ? "Backspace"
            : l === "↵"
              ? "Enter"
              : `${l}${states[l] ? ", " + states[l] : ""}`,
        );
      }
    },
  };
}
export function layout(root) {
  const grid = el("div", "play-layout"),
    surface = el("div", "play-surface"),
    companion = el("aside", "play-companion");
  grid.append(surface, companion);
  root.append(grid);
  return { surface, companion };
}
export function legend() {
  const e = el("div", "legend");
  e.append(el("h2", "", "Follow the letters"));
  for (const [mark, text] of [
    ["correct", "Right letter, right place"],
    ["present", "Right letter, new place"],
    ["absent", "Not in this word"],
  ]) {
    const p = el("p"),
      s = el("span", `sample ${mark}`, symbols[mark]);
    s.setAttribute("aria-hidden", "true");
    p.append(s, document.createTextNode(text));
    e.append(p);
  }
  return e;
}
