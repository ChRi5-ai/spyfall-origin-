// ============================================================
// SERVER/RESULTS-LOGIC.JS — Winner determination
// ============================================================
// One pure function, deliberately: given whether the eliminated
// player was the spy and (if so) whether their guess was correct,
// what's the outcome? No room/socket knowledge here at all — keeping
// this trivial to verify on its own, since getting a Spyfall winner
// condition wrong is exactly the kind of bug that's easy to miss in
// a larger function.
// ------------------------------------------------------------

const SPY_WINS = 'SPY_WINS';
const CIVILIANS_WIN = 'CIVILIANS_WIN';
const DRAW = 'DRAW';

function determineWinner({ wasSpy, guessCorrect }) {
  if (!wasSpy) return SPY_WINS;
  return guessCorrect ? DRAW : CIVILIANS_WIN;
}

module.exports = { determineWinner, SPY_WINS, CIVILIANS_WIN, DRAW };
