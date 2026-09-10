// The audit's dead prompt builders (D21): exported, maintained, shipped —
// and imported by nothing. Both were audit-confirmed real findings.
export function buildSummaryPrompt(subject: string, body: string): string {
  const header = "You are summarizing a support conversation. Reply with three bullet points.";
  const footer = "Do not invent facts that are not in the conversation above.";
  return [header, "", `Subject: ${subject}`, "", body, "", footer].join("\n");
}

export function buildEscalationPrompt(subject: string, severity: string): string {
  const header = "You are drafting an escalation note for the on-call engineer.";
  const footer = "Keep it under one hundred words and cite the timeline.";
  return [header, "", `Subject: ${subject}`, `Severity: ${severity}`, "", footer].join("\n");
}
