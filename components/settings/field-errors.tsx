"use client";
import { createContext, useContext } from "react";
export const FieldErrorsContext = createContext<Record<string, string>>({});
export function FieldError({ name }: { name: string }) {
  const errors = useContext(FieldErrorsContext);
  return errors[name] ? <p id={`${name}-error`} role="alert" className="text-sm text-destructive">{errors[name]}</p> : null;
}
