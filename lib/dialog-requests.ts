export type DialogOptions = { title?: string; confirmLabel?: string; destructive?: boolean; defaultValue?: string };
export type DialogRequest = DialogOptions & { id: number; message: string; kind: "confirm" | "prompt"; resolve: (value: string | boolean | null) => void };
let queue: DialogRequest[] = [];
let sequence = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export const subscribeDialogs = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const currentDialog = () => queue[0] ?? null;
export function settleDialog(id: number, value: string | boolean | null) {
  const request = queue.find(item => item.id === id);
  if (!request) return;
  queue = queue.filter(item => item.id !== id);
  request.resolve(value);
  emit();
}
export function cancelDialogs() {
  const pending = queue;
  queue = [];
  pending.forEach(request => request.resolve(request.kind === "prompt" ? null : false));
  emit();
}
function requestDialog(kind: DialogRequest["kind"], message: string, options: DialogOptions) {
  return new Promise<string | boolean | null>(resolve => {
    queue = [...queue, { ...options, kind, message, id: ++sequence, resolve }];
    emit();
  });
}
export async function confirmDialog(message: string, options: DialogOptions = {}): Promise<boolean> {
  return (await requestDialog("confirm", message, options)) === true;
}
export async function promptDialog(message: string, options: DialogOptions = {}): Promise<string | null> {
  const result = await requestDialog("prompt", message, options);
  return typeof result === "string" ? result : null;
}
