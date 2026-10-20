type Contact = { pointerId: number; clientX: number; clientY: number };

/** Touch holding opens a menu; it never commits a reaction. Movement cancels it. */
export function createMessageHold(onHold: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let contact: Contact | undefined;
  let held = false;
  function cancel() {
    clearTimeout(timer);
    timer = undefined;
    contact = undefined;
  }
  return {
    get tracking() { return contact !== undefined; },
    start(point: Contact) {
      cancel();
      held = false;
      contact = point;
      timer = setTimeout(() => {
        cancel();
        held = true;
        onHold();
      }, 500);
    },
    move(point: Contact) {
      if (contact && (point.pointerId !== contact.pointerId ||
        Math.hypot(point.clientX - contact.clientX, point.clientY - contact.clientY) > 8)) cancel();
    },
    cancel,
    reset() { cancel(); held = false; },
    consumeClick() {
      const suppress = held;
      held = false;
      return suppress;
    },
  };
}
