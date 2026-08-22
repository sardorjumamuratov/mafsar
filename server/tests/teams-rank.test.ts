import { describe, it, expect } from "vitest";
import { rankLeaderboard } from "../src/teams.js";

// Pure ranking logic, no DB: sorted by mastered desc, then reviews7d desc, then
// email asc, each row carrying a 1-based rank where equal keys share a rank
// (competition style — two winners means the next row is 3rd).

const m = (userId: string, email: string, mastered: number, reviews7d: number, streak = 0) => ({
  userId, email, mastered, reviews7d, streak,
});

describe("rankLeaderboard", () => {
  it("returns [] for empty input", () => {
    expect(rankLeaderboard([])).toEqual([]);
  });

  it("sorts by mastered descending", () => {
    const out = rankLeaderboard([
      m("u1", "a@x.dev", 2, 0),
      m("u2", "b@x.dev", 7, 0),
      m("u3", "c@x.dev", 5, 0),
    ]);
    expect(out.map((r) => r.userId)).toEqual(["u2", "u3", "u1"]);
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("breaks mastered ties on reviews7d descending", () => {
    const out = rankLeaderboard([
      m("u1", "a@x.dev", 5, 3),
      m("u2", "b@x.dev", 5, 9),
      m("u3", "c@x.dev", 5, 1),
    ]);
    expect(out.map((r) => r.userId)).toEqual(["u2", "u1", "u3"]);
  });

  it("breaks full ties on email ascending (deterministic order)", () => {
    const out = rankLeaderboard([
      m("u1", "zoe@x.dev", 4, 2),
      m("u2", "adam@x.dev", 4, 2),
      m("u3", "mid@x.dev", 4, 2),
    ]);
    expect(out.map((r) => r.email)).toEqual(["adam@x.dev", "mid@x.dev", "zoe@x.dev"]);
  });

  it("gives equal (mastered, reviews7d) keys the same rank; the next rank skips", () => {
    const out = rankLeaderboard([
      m("u1", "zoe@x.dev", 9, 4),
      m("u2", "adam@x.dev", 9, 4),
      m("u3", "mid@x.dev", 9, 4),
      m("u4", "last@x.dev", 1, 0),
    ]);
    expect(out.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
  });

  it("is 1-based and carries every input field through", () => {
    const out = rankLeaderboard([m("u1", "a@x.dev", 3, 12, 5)]);
    expect(out).toEqual([{ userId: "u1", email: "a@x.dev", mastered: 3, reviews7d: 12, streak: 5, rank: 1 }]);
  });

  it("does not mutate the input array", () => {
    const input = [m("u1", "a@x.dev", 1, 0), m("u2", "b@x.dev", 9, 0)];
    const snapshot = input.map((r) => r.userId);
    rankLeaderboard(input);
    expect(input.map((r) => r.userId)).toEqual(snapshot);
  });
});
