"use client";
import { useContext, useId, useState, useSyncExternalStore } from "react";
import { FieldErrorsContext } from "./field-errors";
import { Input } from "@/components/ui/input";
import { isValidTimeZone, timezoneOptions } from "@/lib/timezone";
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function TimezoneControl({ id, name = "timezone", defaultValue = "UTC" }: { id: string; name?: string; defaultValue?: string }) {
  const listId = useId();
  // Node and browsers can ship different IANA databases. Keep hydration stable,
  // then populate suggestions from the browser without changing the saved value.
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  const options = hydrated ? timezoneOptions(defaultValue) : [...new Set([defaultValue, "UTC"])];
  const serverErrors = useContext(FieldErrorsContext);
  const [error, setError] = useState("");
  return <>
    <Input id={id} name={name} list={listId} defaultValue={defaultValue} required autoComplete="off" aria-invalid={!!error || !!serverErrors[name]} aria-describedby={error ? `${id}-timezone-error` : serverErrors[name] ? `${name}-error` : undefined}
      onChange={event => { event.target.setCustomValidity(""); setError(""); }}
      onBlur={event => { const message = isValidTimeZone(event.target.value.trim()) ? "" : "Choose a valid timezone, such as Europe/Paris."; event.target.setCustomValidity(message); setError(message); }} />
    <datalist id={listId}>{options.map(zone => <option key={zone} value={zone} />)}</datalist>
    {error ? <p id={`${id}-timezone-error`} role="alert" className="text-sm text-destructive">{error}</p> : null}
  </>;
}
