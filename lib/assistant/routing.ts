import type { Role } from "./tools";

/** Route multi-step or operationally sensitive work to the stronger tool model. */
export function assistantTaskKeyFor(
  text: string,
  role: Role
): "assistant" | "assistant_complex" {
  const normalized = text.toLocaleLowerCase();
  const projectRead =
    /\b(project|projects|portfolio|book|books|article|articles|podcast|podcasts|video|videos)\b/.test(
      normalized
    ) &&
    /\b(which|what|show|list|how many|when|who|where|due|status|progress|at risk|blocked|need|needs|missing)\b/.test(
      normalized
    ) &&
    !/\b(create|add|update|change|assign|delete|remove|draft|send|email|reply|pay|record|post)\b/.test(
      normalized
    );
  const operational =
    /\b(email|reply|rights|license|royalt|payment|budget|obligation|publisher|printer|delete|remove|invite|member)\b/.test(
      normalized
    );
  const multiStep =
    /\b(and then|after that|all of|everything|for each|compare|plan|sequence)\b/.test(
      normalized
    ) || text.length > 500;
  if (projectRead && !multiStep) return "assistant";
  return (role !== "member" && operational) || multiStep
    ? "assistant_complex"
    : "assistant";
}
