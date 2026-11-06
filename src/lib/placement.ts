export interface Slot {
  no: number;
  /** 1が手前 */
  row: number;
  /** 0が向かって左 */
  index: number;
  controller: boolean;
}

export function slotsFor(counts: number[]): Slot[] {
  const slots: Slot[] = [];
  let no = 1;
  counts.forEach((count, row) => {
    for (let index = 0; index < count; index++) {
      slots.push({ no, row: row + 1, index, controller: no === 1 });
      no += 1;
    }
  });
  return slots;
}

export function slotForPlace(counts: number[], place: number): Slot | null {
  return slotsFor(counts).find((slot) => slot.no === place) ?? null;
}

export function slotCaption(slot: Slot): string {
  return `${slot.row}列目・左から${slot.index + 1}`;
}
