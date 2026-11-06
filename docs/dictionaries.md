# English guess dictionaries

Fivefold accepts 12,578 five-letter English guesses from [`word-list` 4.1.0](https://github.com/sindresorhus/word-list), a word-game dictionary derived from [atebits/Words](https://github.com/atebits/Words/blob/master/Words/en.txt). Its [MIT license](../games/fivefold/WORD-LIST-LICENSE.txt) is included in the game package and production image. The exact npm release and tarball integrity are locked in `package-lock.json`.

Only lowercase ASCII words of exactly five letters are imported, then uppercased, deduplicated and sorted. The curated Fivefold answers are also included so every puzzle is solvable. This expansion includes STORK, HERON and EGRET and preserves all 781 previously accepted guesses. It is a broad word-game list, not an exhaustive guarantee that every English word or spelling is present.

The guess dictionary is separate from the curated answer pool: accepting STORK as a guess does not make it a winning answer to a different bird puzzle. The 31 answers, clue fixtures, publication validation and Unjumble vocabulary are unchanged. Invalid or repeated guesses still consume no turn, and the module version stays at 1 to preserve saved progress.

## Regenerate and verify

```sh
npm ci
npm run update:fivefold-dictionary
node scripts/update-fivefold-dictionary.mjs --check
npm test
npm run check:games
```

`word-list` is a development dependency only. The generated list is committed inside `games/fivefold/catalog.json`; static preview and deployed daily API use that same catalog. No browser dictionary lookup, extra service, provider key or runtime npm installation is needed. Review dictionary dependency updates, regenerate, run the tests, and ship the updated catalog with the application image.
