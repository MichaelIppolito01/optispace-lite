// api/claude.js — OptiSpace Lite v1.1
// Vercel serverless function. Generates a single interpretation paragraph that
// explains the market and behavioral context behind the deterministic recommendation.
// Does NOT make recommendations — that job belongs to the deterministic comparison block in App.jsx.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { inputs, originalInputs, capacityEstimates, recommendedScenario, program } = req.body;

    const hasHC = originalInputs.headcount && originalInputs.headcount > 0;
    const hasSF = originalInputs.currentSF && originalInputs.currentSF > 0;

    let mode;
    if (hasHC && hasSF) mode = "right_sizing_audit";
    else if (hasSF && !hasHC) mode = "capacity_evaluation";
    else mode = "forward_planning";

    const systemPrompt = `You are a senior corporate real estate strategist writing one short, opinionated paragraph of MARKET CONTEXT for a workplace planner.

CRITICAL CONSTRAINTS — the deterministic engine in the UI has already produced and displayed:
- The recommended program (total SF, desks, meeting rooms, annual cost)
- The comparison to the user's current state or to a traditional 1:1 baseline
- A tactical breakdown of changes (specific desk count deltas, room conversions, SF per desk targets)
- Financial impact (savings or shortage in dollars per year)

Your job is the OPPOSITE of the deterministic engine. You write ONE tight paragraph (2-3 sentences, never more) that gives the user the ONE THING THAT MATTERS MOST about why these numbers look this way. Pick the sharpest take and make it. Don't survey the topic — commit to a point of view.

Possible angles (pick ONE per response):
- The market dynamic that makes timing matter (e.g., specific city sublease conditions in Q1 2026, lease leverage windows)
- The behavioral pattern that drives the variance (e.g., conference room overbuilding, peak occupancy reality vs assumed)
- The strategic tradeoff the user is implicitly making (e.g., operational maturity required for hoteling, change management cost)

You MUST NOT:
- Recommend specific actions (no "you should reduce desks", "consider hoteling", "shift to hybrid")
- Echo or restate the deterministic recommendation
- Use bullet points, headers, or lists — output is ONE flowing paragraph
- Write more than 3 sentences
- Hedge with phrases like "it depends" or "varies by team"
- Use phrases like "we recommend", "you should", "consider doing"

You SHOULD:
- Write in confident, executive prose — the voice of a senior advisor with a take
- Lead with the sharpest observation, not setup
- Be intellectually honest but pointed

Output: a single JSON object with one field, "interpretation", containing the paragraph as a string. No other fields. No preamble. No code fences.`;

    let userMessage;

    if (mode === "right_sizing_audit") {
      const sfDelta = originalInputs.currentSF - program.totalSF;
      const sfPct = Math.round((sfDelta / originalInputs.currentSF) * 100);
      const sfPerPerson = Math.round(originalInputs.currentSF / originalInputs.headcount);
      const recSFPerPerson = Math.round(program.totalSF / originalInputs.headcount);

      userMessage = `Right-sizing audit context:

City: ${originalInputs.city}
Headcount: ${originalInputs.headcount}
Current SF: ${originalInputs.currentSF} (${sfPerPerson} SF/person)
Recommended SF: ${program.totalSF} (${recSFPerPerson} SF/person)
Variance: ${sfPct > 0 ? "+" : ""}${sfPct}% ${sfPct > 0 ? "oversized" : "undersized"}
Work Style: ${originalInputs.workStyle}
${originalInputs.workStyle === "Hybrid" ? `Days in office: ${originalInputs.daysInOffice}/week` : ""}
Meeting need: ${originalInputs.meetingPref}

Write 2-3 sentences. Lead with the sharpest market or behavioral observation that explains why a footprint at this profile shows this kind of variance. Pick ONE angle — don't survey. Do not recommend actions.`;
    } else if (mode === "capacity_evaluation") {
      userMessage = `Capacity evaluation context:

City: ${originalInputs.city}
Available SF: ${originalInputs.currentSF}
Capacity at Assigned: ~${capacityEstimates.Assigned} people
Capacity at Hybrid (3-day): ~${capacityEstimates.Hybrid} people
Capacity at Hoteling: ~${capacityEstimates.Hoteling} people
Stated work style: ${originalInputs.workStyle}
Meeting need: ${originalInputs.meetingPref}

Write 2-3 sentences. Lead with the sharpest take on what really separates these capacity options in practice — operational maturity, change management cost, or why the wide range exists. Pick ONE angle. Do not recommend a work style.`;
    } else {
      userMessage = `Forward-planning context:

City: ${originalInputs.city}
Headcount: ${originalInputs.headcount}
Work Style: ${originalInputs.workStyle}
${originalInputs.workStyle === "Hybrid" ? `Days in office: ${originalInputs.daysInOffice}/week` : ""}
Meeting need: ${originalInputs.meetingPref}
Recommended SF: ${program.totalSF}
Traditional 1:1 SF would be: significantly higher

Write 2-3 sentences. Lead with the sharpest behavioral or market observation about why traditional 1:1 sizing inflates footprints for this attendance pattern, OR what the city-specific market dynamic in Q1 2026 means for timing. Pick ONE angle. Do not tell the user what to do.`;
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    });

    let text = response.content[0].text.trim();
    // Strip code fences if model added them despite instructions
    text = text.replace(/^```json\s*/, "").replace(/```\s*$/, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // If model returned a bare paragraph instead of JSON, wrap it
      parsed = { interpretation: text };
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error("Claude API error:", error);
    return res.status(500).json({ error: "Internal server error", message: error.message });
  }
}
