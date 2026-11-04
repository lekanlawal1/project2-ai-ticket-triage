// The decision: a message goes straight to a team only when two independent opinions agree and
// the AI is sure, with evidence that's really in the message. Anything else goes to the human desk,
// with the reasons. The 0.8 bar was set before any scoring and not tuned on the results.
export const MIN_CONFIDENCE = 0.8;

export function decide(baselineTeam, ai) {
  if (!ai) return { route: "human", why: ["The AI didn't answer, so a person checks it"] };
  const why = [];
  if (ai.team !== baselineTeam) why.push("The AI and the plain model disagree");
  if (ai.confidence < MIN_CONFIDENCE) why.push(`The AI is only ${Math.round(ai.confidence * 100)}% sure`);
  if (!ai.evidenceFound) why.push("The AI's quote isn't in the message");
  return why.length ? { route: "human", why } : { route: ai.team, why: [] };
}
