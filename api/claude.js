// Vercel serverless function — proxies requests to Anthropic API
// API key is read from environment variable (never exposed to browser)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured" });
  }

  try {
    const { inputs, originalInputs, capacityEstimates, program } = req.body;

    // Determine which mode based on what the user originally provided
    // originalInputs reflects the user's actual form values (HC may be null in SF-only mode)
    const orig = originalInputs || inputs;
    const userProvidedHC = orig.headcount && orig.headcount > 0;
    const userProvidedSF = orig.currentSF && orig.currentSF > 0;

    const isAudit = userProvidedHC && userProvidedSF;
    const isCapacityEval = userProvidedSF && !userProvidedHC;
    const isPlanning = userProvidedHC && !userProvidedSF;

    const sfDelta = isAudit ? orig.currentSF - program.totalSF : null;
    const sfPct = isAudit ? Math.round((sfDelta / orig.currentSF) * 100) : null;

    const baseContext = `You are a senior workplace strategist with 15 years of corporate real estate experience. A client has given you the following space program data:

- Work style: ${inputs.workStyle}
- Average days in office: ${inputs.daysInOffice}/week
- Meeting room preference: ${inputs.meetingPref}
- Location: ${inputs.city}`;

    let modeContext = "";

    if (isAudit) {
      modeContext = `
- Company headcount: ${orig.headcount} people
- Calculated total SF (recommended): ${program.totalSF.toLocaleString()} SF
- Desk count: ${program.deskCount}
- Meeting rooms: ${program.meetingRooms} (${program.smallRooms} small, ${program.medRooms} medium, ${program.largeRooms} large)
- Annual occupancy cost estimate: $${program.annualCost.toLocaleString()}
- Current footprint: ${orig.currentSF.toLocaleString()} SF
- Delta vs. recommended: ${sfDelta > 0 ? "+" : ""}${sfDelta.toLocaleString()} SF (${sfPct > 0 ? "+" : ""}${sfPct}%)
- Current SF per person: ${Math.round(orig.currentSF / orig.headcount)} SF/person
- Recommended SF per person: ${Math.round(program.totalSF / orig.headcount)} SF/person

This is a RIGHT-SIZING AUDIT. The client has an existing space and wants to know if it's appropriately sized. Frame your recommendation as an audit finding with specific numerical comparisons. The headline should call out the current vs. recommended gap directly. The impact should quantify the dollar opportunity (savings if oversized, additional cost if undersized).`;
    } else if (isCapacityEval) {
      const cap = capacityEstimates || {};
      modeContext = `
- Available footprint: ${orig.currentSF.toLocaleString()} SF
- Estimated capacity at Assigned seating: ~${cap.Assigned} people
- Estimated capacity at Hybrid (3 days/week): ~${cap.Hybrid} people
- Estimated capacity at Hoteling: ~${cap.Hoteling} people
- Annual occupancy cost at this footprint: $${program.annualCost.toLocaleString()}

This is a CAPACITY EVALUATION. The client has a fixed footprint (e.g. evaluating a lease, inheriting a space, or working with a broker) and wants to know what headcount this space can support across different work styles. The headline should articulate the realistic capacity range. The impact should anchor on a single defensible number (typically Hybrid). The bullets should help the user think about which work style fits their culture.`;
    } else {
      // Planning mode
      modeContext = `
- Company headcount: ${orig.headcount} people
- Calculated total SF (recommended): ${program.totalSF.toLocaleString()} SF
- Desk count: ${program.deskCount}
- Meeting rooms: ${program.meetingRooms} (${program.smallRooms} small, ${program.medRooms} medium, ${program.largeRooms} large)
- Annual occupancy cost estimate: $${program.annualCost.toLocaleString()}
- Desk ratio: ${program.deskRatio}
- Peak occupancy: ${program.peakOccupancy}

This is a FORWARD-LOOKING PROGRAMMING analysis. The client is sizing a new space or planning ahead. Frame your recommendation as strategic guidance for the upcoming decision. The headline should articulate the main insight about their programming. The impact should highlight a key optimization opportunity.`;
    }

    const prompt = `${baseContext}${modeContext}

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{
  "headline": "one sharp sentence summarizing the main insight and opportunity, written for a VP or CFO",
  "impact": "one short punchy sentence with a specific dollar or percentage figure — e.g. 'You could reduce occupancy costs by ~$340K annually.' or 'You're likely carrying 18% excess space.'",
  "bullets": [
    "specific actionable insight #1 with numbers",
    "specific actionable insight #2 with numbers",
    "specific actionable insight #3 with numbers"
  ]
}

Make the insights genuinely useful — not generic alerts. Reference actual numbers. Sound like a strategist in a meeting, not a software tool.

CRITICAL FRAMING: When the analysis reveals an opportunity to reduce cost, frame the impact as money currently being WASTED, not as potential savings. "You are likely overpaying ~$152K/yr for unused space" lands harder than "You could save ~$152K annually." Use active loss-framing language: "carrying," "overpaying," "absorbing," "leaking," "tied up in."

Also: be opinionated. You are a strategist with 15 years of experience, not a calculator. If the data suggests the client is overbuilt on conference rooms, say so directly: "Most companies your size overbuild large conference rooms by 2-3x." If hybrid attendance doesn't justify their current desk ratio, say it: "A 1:1 desk ratio is rarely justified at 3-day attendance patterns." Lead with conviction.`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      console.error("Anthropic API error:", errorText);
      return res.status(anthropicResponse.status).json({ error: "Anthropic API error" });
    }

    const data = await anthropicResponse.json();
    const text = data.content?.find(b => b.type === "text")?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (error) {
    console.error("Handler error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
