import { WebSocket } from "ws";
import { slotCaption, slotsFor } from "../src/lib/placement";
import { adjacentIndexes, buildPass } from "../src/lib/path";
import { Room, type ClientSocket } from "../src/server/room";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function fakeSocket(): ClientSocket {
  return { readyState: WebSocket.OPEN, send() {} } as unknown as ClientSocket;
}

assert(adjacentIndexes(2, 0, 3).join(",") === "0,1", "two phones, left green, cannot skip to the far right of three");
assert(adjacentIndexes(2, 1, 3).join(",") === "1,2", "two phones, right green, cannot skip to the far left of three");
assert(adjacentIndexes(3, 1, 3).join(",") === "0,2", "same count cannot stay on the same phone");
assert(adjacentIndexes(4, 0, 4).join(",") === "1", "the end only moves to its neighbor");
assert(adjacentIndexes(2, 0, 2).join(",") === "1", "two and two must switch sides");

const shapes = [
  [2, 2],
  [2, 3],
  [3, 2],
  [4, 2],
  [2, 4],
  [3, 3],
  [4, 4],
  [2, 3, 4],
  [4, 3, 2],
  [3, 4, 2],
];
for (const counts of shapes) {
  for (let n = 0; n < 40; n++) {
    const greens = buildPass(counts, Math.random);
    assert(greens.length === counts.length, "one green per line");
    for (let i = 1; i < greens.length; i++) {
      const allowed = adjacentIndexes(counts[i - 1], greens[i - 1], counts[i]);
      assert(allowed.includes(greens[i]), `${counts.join("x")} step ${i} stayed adjacent`);
    }
  }
}

const slots = slotsFor([2, 3, 2]);
assert(slots[0]?.controller && slots[0].row === 1 && slots[0].index === 0, "controller is the near left");
assert(slots.map((slot) => `${slot.row}:${slot.index}`).join(",") === "1:0,1:1,2:0,2:1,2:2,3:0,3:1", "phones fill each row from the left");
assert(slotCaption(slots[4]) === "2列目・左から3", "caption counts from the left");

const room = new Room("TEST01");
try {
  room.addController(fakeSocket());
  room.updateConfig({ lines: 2, counts: [2, 3, 2], intervalSeconds: 4 });
  room.addDisplay(fakeSocket(), "a");
  room.start();
  assert(!room.snapshot().config.running, "the row needs every phone");
  for (const id of ["b", "c", "d"]) room.addDisplay(fakeSocket(), id);
  room.start();
  const live = room.snapshot();
  assert(live.config.running && live.activeLine === 0, "the near row goes first");
  const lineOne = [live.controllerSignal, live.displays.find((d) => d.place === 2)?.signal];
  assert(lineOne.filter((signal) => signal === "green").length === 1, "the near row has one green");
  assert(lineOne.filter((signal) => signal === "red").length === 1, "the other near phone is red");
  assert(live.displays.filter((d) => d.place > 2).every((d) => d.signal == null), "farther rows stay colorless");
  room.updateConfig({ intervalSeconds: 9 });
  assert(room.snapshot().config.intervalSeconds === 4, "settings lock while running");
  const first = room.greens[0];
  room.nextLine();
  const second = room.snapshot();
  assert(second.activeLine === 1, "the next row follows");
  assert(second.controllerSignal == null && second.displays.find((d) => d.place === 2)?.signal == null, "the near row goes colorless");
  const lineTwo = second.displays.filter((d) => d.place >= 3).map((d) => d.signal);
  assert(lineTwo.filter((signal) => signal === "green").length === 1, "the second row has one green");
  assert(lineTwo.filter((signal) => signal === "red").length === 2, "the rest of the second row is red");
  assert(adjacentIndexes(2, first, 3).includes(room.greens[1]), "the second green touches the first");
  room.stop();
  const stopped = room.snapshot();
  assert(!stopped.config.running && stopped.controllerSignal == null && stopped.activeLine == null, "stop clears the colors");
  assert(stopped.displays.every((d) => d.signal == null), "other phones return to colorless");
} finally {
  room.destroy();
}

const full = new Room("TEST02");
try {
  full.updateConfig({ lines: 1, counts: [1, 9, 3], intervalSeconds: 99 });
  const cfg = full.snapshot().config;
  assert(cfg.lines === 1 && cfg.counts.join(",") === "2,4,3" && cfg.intervalSeconds === 10, "counts and seconds stay inside the range");
  for (let i = 0; i < 11; i++) full.addDisplay(fakeSocket(), `p${i}`);
  const rejected = full.addDisplay(fakeSocket(), "overflow");
  assert(!rejected.ok, "a twelfth surrounding phone is rejected");
} finally {
  full.destroy();
}

console.log("drive rules ok");
