import { useState, useCallback } from "react";

// Office cost per SF — blended Class A/B full-service equivalent rates, Q1 2026
// Sources: CBRE Q1 2026 Market Reports, JLL Q1 2026, Colliers Q1 2026,
// Cushman & Wakefield MarketBeats Q1 2026, CommercialCafe National Office Report Feb 2026
// Last updated: April 2026 — rates should be refreshed quarterly
const COST_PER_SF = {
  // Tier 1 — Premium gateway markets ($50+)
  "Bay Area (Peninsula/East Bay)": 53,
  "Boston": 50,
  "Miami": 55,
  "New York (Manhattan)": 78,
  "San Francisco": 66,
  "San Jose / Silicon Valley": 55,

  // Tier 2 — Major coastal & growth markets ($40–50)
  "Austin": 46,
  "Los Angeles": 42,
  "Orange County": 40,
  "San Diego": 42,
  "Seattle": 47,
  "Washington, DC": 46,

  // Tier 3 — Established secondary markets ($30–40)
  "Atlanta": 37,
  "Charlotte": 36,
  "Chicago": 29,
  "Dallas": 32,
  "Denver": 30,
  "Houston": 31,
  "Nashville": 31,
  "Philadelphia": 31,
  "Phoenix": 30,
  "Raleigh-Durham": 30,
  "Tampa": 30,

  // Tier 4 — Affordable major metros ($20–30)
  "Cleveland": 21,
  "Detroit": 22,
  "Indianapolis": 22,
  "Kansas City": 22,
  "Las Vegas": 28,
  "Minneapolis / Twin Cities": 27,
  "Orlando": 28,
  "Pittsburgh": 24,
  "Portland, OR": 28,
  "Salt Lake City": 28,
  "St. Louis": 22,

  // Fallback for cities not on the list — uses national average ($32.79 per CommercialCafe Feb 2026)
  "Other": 33
};

// Date stamp shown to user — update when COST_PER_SF table is refreshed
const COST_DATA_AS_OF = "Q1 2026";

const WORK_STYLES = ["Assigned", "Hybrid", "Mixed", "Hoteling"];
const MEETING_PREFS = ["Light", "Moderate", "Heavy"];
const DENSITIES = ["Conservative", "Balanced", "Aggressive"];

const WORK_STYLE_HINTS = {
  "Assigned": "Every employee has a dedicated desk. No sharing. Common in labs, legal, finance, or cultures with low remote adoption.",
  "Hybrid": "Employees split time between office and home. Desks are shared across a team. The most common post-2020 model.",
  "Mixed": "A split population — some teams are assigned, others are hybrid. Common in large enterprises where functions have different attendance patterns.",
  "Hoteling": "No assigned seats — employees book a desk when they come in. Highest sharing ratio. Common in consulting, sales, or fully flexible environments."
};

const MEETING_PREF_HINTS = {
  "Light": "Mostly heads-down work. Occasional 1:1s and small syncs. Typical for engineering or creative teams.",
  "Moderate": "Regular team meetings, client calls, and cross-functional collaboration. Balanced mix of focus and meeting time.",
  "Heavy": "Meeting-intensive culture. Multiple formal rooms needed daily. Typical for sales, consulting, executive, or client-facing teams."
};

function computeProgram(inputs, scenarioStyle, scenarioDensity) {
  const { headcount, daysInOffice, meetingPref, mixedRatio = 50 } = inputs;
  const style = scenarioStyle || inputs.workStyle;
  const density = scenarioDensity || "Balanced";

  let presenceRatio, deskRatio;
  if (style === "Assigned") {
    presenceRatio = 1.0; deskRatio = 1.0;
  } else if (style === "Hybrid") {
    presenceRatio = daysInOffice / 5; deskRatio = 0.7;
  } else if (style === "Mixed") {
    const assignedFraction = mixedRatio / 100;
    const hybridFraction = 1 - assignedFraction;
    presenceRatio = (assignedFraction * 1.0) + (hybridFraction * (daysInOffice / 5));
    deskRatio = (assignedFraction * 1.0) + (hybridFraction * 0.7);
  } else {
    presenceRatio = 0.5; deskRatio = 0.55;
  }

  const densityMultiplier = density === "Conservative" ? 1.15 : density === "Balanced" ? 1.0 : 0.88;
  const peakOccupancy = Math.round(headcount * presenceRatio);
  const deskCount = Math.round(headcount * deskRatio * densityMultiplier);

  const meetingMultiplier = meetingPref === "Light" ? 0.08 : meetingPref === "Moderate" ? 0.12 : 0.16;
  const meetingRooms = Math.round(headcount * meetingMultiplier);
  const smallRooms = Math.round(meetingRooms * 0.5);
  const medRooms = Math.round(meetingRooms * 0.35);
  const largeRooms = meetingRooms - smallRooms - medRooms;

  const sfPerDesk = style === "Assigned" ? 150 : style === "Hybrid" ? 130 : style === "Mixed" ? 140 : 110;
  const deskSF = deskCount * sfPerDesk;
  const meetingSF = (smallRooms * 120) + (medRooms * 250) + (largeRooms * 450);
  const collabSF = Math.round(deskSF * 0.15);
  const supportSF = Math.round(deskSF * 0.1);
  const totalSF = deskSF + meetingSF + collabSF + supportSF;

  return { peakOccupancy, deskCount, meetingRooms, smallRooms, medRooms, largeRooms, deskSF, meetingSF, collabSF, supportSF, totalSF, presenceRatio, deskRatio };
}

// Inverse computation: given target SF, estimate headcount capacity for a given work style
// Solves the SF equations backwards to find the HC that produces ~targetSF
function estimateHCFromSF(targetSF, workStyle, meetingPref = "Moderate", density = "Balanced") {
  // Start with a reasonable bounded search (10 to 5000 people)
  // Binary-search for the HC that produces totalSF closest to target
  let low = 10;
  let high = 5000;
  let bestHC = low;
  let bestDiff = Infinity;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const trialInputs = { headcount: mid, daysInOffice: 3, meetingPref, mixedRatio: 50, workStyle };
    const result = computeProgram(trialInputs, workStyle, density);
    const diff = Math.abs(result.totalSF - targetSF);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestHC = mid;
    }

    if (result.totalSF < targetSF) {
      low = mid + 1;
    } else if (result.totalSF > targetSF) {
      high = mid - 1;
    } else {
      return mid;
    }
  }
  return bestHC;
}

function computeCapacityFromSF(targetSF, meetingPref = "Moderate") {
  return {
    Assigned: estimateHCFromSF(targetSF, "Assigned", meetingPref),
    Hybrid: estimateHCFromSF(targetSF, "Hybrid", meetingPref),
    Hoteling: estimateHCFromSF(targetSF, "Hoteling", meetingPref)
  };
}

function getAnnualCost(sf, city) {
  return sf * (COST_PER_SF[city] || 33);
}

function formatNum(n) { return n?.toLocaleString() ?? "—"; }
function formatSF(n) { return `${formatNum(n)} SF`; }
function formatCost(n) { return `$${(n / 1000).toFixed(0)}K`; }

const STYLES_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0c0e0f;
    color: #e8e4dc;
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
  }

  .app {
    max-width: 880px;
    margin: 0 auto;
    padding: 48px 32px 80px;
    text-align: left;
  }

  .header { margin-bottom: 56px; text-align: left; }

  .logo {
    font-family: 'Syne', sans-serif;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #c8b97a;
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo::before {
    content: '';
    display: inline-block;
    width: 6px;
    height: 6px;
    background: #c8b97a;
    border-radius: 50%;
  }

  .headline {
    font-family: 'Syne', sans-serif;
    font-weight: 800;
    font-size: clamp(32px, 5vw, 52px);
    line-height: 1.05;
    color: #f0ece2;
    margin-bottom: 16px;
    letter-spacing: -0.02em;
    text-align: left;
  }

  .subhead {
    font-size: 16px;
    color: #8a8478;
    font-weight: 300;
    line-height: 1.6;
    max-width: 520px;
    text-align: left;
  }

  .trust-block {
    background: #0c0e0f;
    border: 1px solid #1e2022;
    border-left: 2px solid #c8b97a;
    border-radius: 2px;
    padding: 28px 32px;
    margin-bottom: 32px;
    animation: fadeUp 0.5s ease 0.15s both;
  }

  .trust-line {
    font-family: 'DM Mono', monospace;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: #c8b97a;
    line-height: 1.6;
    margin-bottom: 18px;
  }

  .trust-divider {
    height: 1px;
    background: #1e2022;
    margin-bottom: 18px;
  }

  .trust-positioning {
    display: grid;
    gap: 14px;
  }

  .trust-row {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 20px;
    align-items: baseline;
  }

  .trust-label {
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6a6760;
    line-height: 1.4;
  }

  .trust-text {
    font-size: 13px;
    color: #c0bbb0;
    line-height: 1.65;
  }

  @media (max-width: 720px) {
    .trust-block {
      padding: 22px 20px;
    }
    .trust-row {
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .trust-label {
      font-size: 9px;
    }
  }

  .form-section {
    background: #141618;
    border: 1px solid #252820;
    border-radius: 2px;
    padding: 40px;
    margin-bottom: 40px;
  }

  .form-section h2 {
    font-family: 'Syne', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #c8b97a;
    margin-bottom: 32px;
  }

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 28px;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .form-field.full { grid-column: 1 / -1; }

  .form-field label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6a6760;
  }

  .form-field input[type="number"],
  .form-field select {
    background: #0c0e0f;
    border: 1px solid #252820;
    border-radius: 2px;
    padding: 12px 16px;
    color: #e8e4dc;
    font-family: 'DM Mono', monospace;
    font-size: 15px;
    outline: none;
    transition: border-color 0.2s;
    width: 100%;
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
  }

  .form-field select {
    cursor: pointer;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%23c8b97a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 16px center;
    background-size: 12px 8px;
    padding-right: 40px;
  }

  .form-field input:focus,
  .form-field select:focus { border-color: #c8b97a; }

  .form-field input::placeholder {
    color: #e8e4dc;
    font-family: 'DM Mono', monospace;
    font-size: 15px;
    letter-spacing: 0;
    font-style: italic;
    opacity: 1;
  }

  .form-field input::-webkit-input-placeholder {
    color: #e8e4dc;
  }

  .form-field input::-moz-placeholder {
    color: #e8e4dc;
    opacity: 1;
  }

  .btn-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn-toggle {
    padding: 10px 20px;
    border: 1px solid #252820;
    border-radius: 2px;
    background: transparent;
    color: #8a8478;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.02em;
  }

  .btn-toggle:hover { border-color: #444; color: #e8e4dc; }
  .btn-toggle.active {
    background: #c8b97a;
    border-color: #c8b97a;
    color: #0c0e0f;
    font-weight: 600;
  }

  .field-hint {
    margin-top: 10px;
    font-size: 12px;
    color: #6a6760;
    line-height: 1.55;
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    transition: max-height 0.25s ease, opacity 0.2s ease;
    border-left: 2px solid #2a2c28;
    padding-left: 10px;
  }

  .field-hint.visible {
    max-height: 80px;
    opacity: 1;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .slider-row input[type="range"] {
    flex: 1;
    -webkit-appearance: none;
    height: 2px;
    background: #252820;
    outline: none;
    cursor: pointer;
  }

  .slider-row input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    background: #c8b97a;
    border-radius: 50%;
    cursor: pointer;
  }

  .slider-val {
    font-family: 'DM Mono', monospace;
    font-size: 18px;
    font-weight: 500;
    color: #c8b97a;
    min-width: 24px;
    text-align: center;
  }

  .generate-btn {
    margin-top: 32px;
    width: 100%;
    padding: 18px;
    background: #c8b97a;
    border: none;
    border-radius: 2px;
    font-family: 'Syne', sans-serif;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #0c0e0f;
    cursor: pointer;
    transition: background 0.3s ease, opacity 0.2s;
    min-height: 64px;
  }

  .generate-btn:hover { opacity: 0.9; }
  .generate-btn:disabled { cursor: not-allowed; background: #8a7d52; }

  .loading-steps {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .loading-step {
    display: block;
    font-size: 11px;
    letter-spacing: 0.08em;
    opacity: 0;
    transform: translateY(3px);
    transition: opacity 0.4s ease, transform 0.4s ease;
    text-transform: none;
    font-weight: 400;
    color: #1a160a55;
    font-family: 'DM Sans', sans-serif;
  }

  .loading-step.active {
    opacity: 1;
    transform: translateY(0);
    color: #1a160a;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.06em;
  }

  .loading-step.done {
    opacity: 0.3;
    transform: translateY(0);
  }

  .loading-dots {
    display: inline-flex;
    gap: 3px;
    margin-left: 6px;
    vertical-align: middle;
  }

  .loading-dots span {
    width: 4px;
    height: 4px;
    background: #1a160a;
    border-radius: 50%;
    display: inline-block;
    animation: loadDot 1.2s ease-in-out infinite;
  }

  .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes loadDot {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
    40% { opacity: 1; transform: scale(1.2); }
  }

  .action-block {
    background: #0c0e0f;
    border: 1px solid #252820;
    border-left: 3px solid #8bb87a;
    border-radius: 2px;
    padding: 24px 28px;
    margin-bottom: 32px;
    animation: fadeUp 0.5s ease 0.15s both;
    text-align: left;
  }

  .action-label {
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #8bb87a;
    margin-bottom: 14px;
    text-align: left;
  }

  .action-section {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid #1e2022;
    text-align: left;
  }

  .action-section-label {
    font-family: 'Syne', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #4a4f48;
    margin-bottom: 6px;
    text-align: left;
  }

  .action-line {
    font-size: 13px;
    color: #c8c4bc;
    line-height: 1.55;
    padding-left: 16px;
    position: relative;
    margin-bottom: 4px;
    text-align: left;
  }

  .action-line::before {
    content: '→';
    position: absolute;
    left: 0;
    color: #8bb87a;
    font-size: 12px;
    top: 1px;
  }

  .action-apply-btn {
    padding: 10px 20px;
    background: transparent;
    border: 1px solid #8bb87a55;
    border-radius: 2px;
    color: #8bb87a;
    font-family: 'Syne', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-apply-btn:hover {
    background: #8bb87a22;
    border-color: #8bb87a;
  }

  .scenario-reveal-btn {
    width: 100%;
    padding: 14px;
    background: transparent;
    border: 1px solid #252820;
    border-radius: 2px;
    color: #6a6760;
    font-family: 'Syne', sans-serif;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .scenario-reveal-btn:hover {
    border-color: #c8b97a;
    color: #c8b97a;
  }

  .scenario-panel {
    transition: max-height 0.5s ease, opacity 0.4s ease;
    max-height: 0;
    opacity: 0;
    overflow: hidden;
  }

  .scenario-panel.open {
    max-height: 2000px;
    opacity: 1;
    overflow: visible;
  }

  .output-section { animation: fadeUp 0.4s ease; }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .recommendation-card {
    background: #141618;
    border: 1px solid #c8b97a33;
    border-left: 3px solid #c8b97a;
    border-radius: 2px;
    padding: 36px 44px 32px;
    margin-bottom: 48px;
    text-align: left;
  }

  .rec-card-anim {
    animation: fadeUp 0.5s ease both;
  }

  .metrics-anim {
    animation: fadeUp 0.5s ease 0.25s both;
  }

  .rec-label {
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #c8b97a;
    margin-bottom: 4px;
    text-align: left;
  }

  .rec-sublabel {
    font-size: 11px;
    color: #444;
    letter-spacing: 0.04em;
    margin-bottom: 20px;
    font-style: italic;
    text-align: left;
  }

  .rec-impact {
    font-family: 'DM Mono', monospace;
    font-size: 22px;
    color: #c8b97a;
    font-weight: 500;
    padding: 16px 20px;
    background: #c8b97a0f;
    border-left: 2px solid #c8b97a;
    border-radius: 2px;
    letter-spacing: 0.01em;
    line-height: 1.35;
    margin-bottom: 0;
    text-align: left;
  }

  .rec-divider {
    height: 1px;
    background: linear-gradient(to right, #c8b97a33, transparent);
    margin: 20px 0;
  }

  .rec-headline {
    font-family: 'Syne', sans-serif;
    font-size: clamp(18px, 2.8vw, 24px);
    font-weight: 700;
    color: #f0ece2;
    line-height: 1.25;
    margin-bottom: 20px;
    letter-spacing: -0.01em;
    text-align: left;
  }

  .rec-bullets {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding-top: 4px;
    border-top: 1px solid #1e2022;
  }

  .rec-bullets li {
    font-size: 13px;
    color: #8a8478;
    line-height: 1.55;
    padding-left: 20px;
    position: relative;
    padding-top: 4px;
    text-align: left;
  }

  .rec-bullets li::before {
    content: '→';
    position: absolute;
    left: 0;
    color: #c8b97a;
    font-size: 12px;
    top: 4px;
  }

  .metrics-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }

  .metric-card {
    background: #141618;
    border: 1px solid #252820;
    border-radius: 2px;
    padding: 20px 22px;
    text-align: left;
  }

  .metric-label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6a6760;
    margin-bottom: 8px;
  }

  .metric-value {
    font-family: 'DM Mono', monospace;
    font-size: 24px;
    font-weight: 500;
    color: #f0ece2;
    line-height: 1;
  }

  .metric-sub {
    font-size: 11px;
    color: #6a6760;
    margin-top: 4px;
  }

  .scenario-section {
    background: #141618;
    border: 1px solid #252820;
    border-radius: 2px;
    padding: 28px 32px;
    margin-bottom: 32px;
  }

  .scenario-section h3 {
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #6a6760;
    margin-bottom: 20px;
  }

  .scenario-row {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;
    align-items: center;
    flex-wrap: wrap;
  }

  .scenario-label {
    font-size: 12px;
    color: #6a6760;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    min-width: 90px;
  }

  .scenario-compare {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-top: 8px;
  }

  .scenario-col {
    background: #0c0e0f;
    border: 1px solid #252820;
    border-radius: 2px;
    padding: 16px 20px;
  }

  .scenario-col.active { border-color: #c8b97a44; }

  .scenario-col-label {
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6a6760;
    margin-bottom: 12px;
  }

  .scenario-col-label.active-label { color: #c8b97a; }

  .scenario-stat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }

  .scenario-stat-label { font-size: 12px; color: #6a6760; }
  .scenario-stat-val {
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    color: #e8e4dc;
  }

  .bar-section {
    background: #141618;
    border: 1px solid #252820;
    border-radius: 2px;
    padding: 28px 32px;
    margin-bottom: 32px;
    overflow: visible;
    position: relative;
  }

  .bar-section h3 {
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #6a6760;
    margin-bottom: 24px;
  }

  .bar-track {
    height: 36px;
    background: #0c0e0f;
    border-radius: 2px;
    display: flex;
    overflow: hidden;
    margin-bottom: 12px;
  }

  .bar-segment {
    height: 100%;
    transition: width 0.5s ease, opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'DM Mono', monospace;
    font-size: 10px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
  }

  .bar-segment.ai-flagged {
    animation: aiFlagPulse 2s ease-in-out 3;
  }

  @keyframes aiFlagPulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.25); }
  }

  .bar-legend {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #6a6760;
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 1px;
    flex-shrink: 0;
  }

  .export-section {
    background: #141618;
    border: 1px solid #252820;
    border-radius: 2px;
    padding: 28px 32px;
  }

  .export-section h3 {
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: #6a6760;
    margin-bottom: 20px;
  }

  .export-btn {
    padding: 14px 28px;
    background: transparent;
    border: 1px solid #c8b97a;
    border-radius: 2px;
    color: #c8b97a;
    font-family: 'Syne', sans-serif;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s;
  }

  .export-btn:hover {
    background: #c8b97a;
    color: #0c0e0f;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 24px;
  }

  .summary-line {
    display: flex;
    justify-content: space-between;
    padding: 10px 0;
    border-bottom: 1px solid #1e2022;
    font-size: 13px;
  }

  .summary-line span:first-child { color: #6a6760; }
  .summary-line span:last-child {
    font-family: 'DM Mono', monospace;
    color: #e8e4dc;
  }

  @media (max-width: 640px) {
    .form-grid { grid-template-columns: 1fr; }
    .metrics-row { grid-template-columns: 1fr 1fr; }
    .scenario-compare { grid-template-columns: 1fr; }
    .summary-grid { grid-template-columns: 1fr; }
    .form-section { padding: 24px; }
    .recommendation-card { padding: 24px; }
    .app { padding: 32px 20px 60px; }
  }
`;

const BAR_COLORS = ["#c8b97a", "#7a9cb8", "#8bb87a", "#b87a9c"];

function computeRecommendedAction(inputs, output) {
  if (!output) return null;

  const currentStyle = inputs.workStyle;
  const currentSF = output.totalSF;
  const currentCost = getAnnualCost(currentSF, inputs.city);

  let recStyle = currentStyle;
  let recDensity = "Balanced";

  if (currentStyle === "Assigned") {
    recStyle = "Hybrid";
    recDensity = "Balanced";
  } else if (currentStyle === "Hybrid" || currentStyle === "Mixed") {
    recDensity = "Aggressive";
    recStyle = currentStyle;
  } else {
    recDensity = "Aggressive";
  }

  const recProg = computeProgram({ ...inputs, workStyle: recStyle }, recStyle, recDensity);
  const recSF = recProg.totalSF;
  const recCost = getAnnualCost(recSF, inputs.city);
  const sfDelta = currentSF - recSF;
  const costDelta = currentCost - recCost;

  if (sfDelta <= 0) return null;

  return { recStyle, recDensity, sfDelta, costDelta };
}

function HintButtonGroup({ options, value, hints, onChange }) {
  const [hovered, setHovered] = useState(null);
  const activeHint = hovered ? hints[hovered] : (value ? hints[value] : null);
  const showHint = !!(hovered || value);

  return (
    <div>
      <div className="btn-group">
        {options.map(o => (
          <button
            key={o}
            className={`btn-toggle ${value === o ? "active" : ""}`}
            onClick={() => onChange(o)}
            onMouseEnter={() => setHovered(o)}
            onMouseLeave={() => setHovered(null)}
          >{o}</button>
        ))}
      </div>
      <div className={`field-hint ${showHint ? "visible" : ""}`}>
        {activeHint}
      </div>
    </div>
  );
}

const BAR_BENCHMARKS = {
  "Desk Area":      { range: "55–65%", low: 55, high: 65, note: "Higher ratios typical for assigned seating; hybrid orgs trend lower" },
  "Meeting Rooms":  { range: "15–20%", low: 15, high: 20, note: "Heavy meeting cultures can reach 25%; light teams often under 12%" },
  "Collaboration":  { range: "10–15%", low: 10, high: 15, note: "Modern workplaces trending up — reflects activity-based design" },
  "Support":        { range: "8–12%",  low: 8,  high: 12, note: "Includes phone rooms, storage, wellness, and circulation" }
};

function getBenchmarkSignal(label, pct) {
  const b = BAR_BENCHMARKS[label];
  if (!b) return null;
  if (pct < b.low)  return { text: "↓ Below typical range", color: "#7a9cb8" };
  if (pct > b.high) return { text: "⚠ Above typical range", color: "#c8876a" };
  return { text: "✓ Within benchmark", color: "#8bb87a" };
}

const AI_MICRO_INSIGHTS = {
  "Desk Area":     "Your work style and attendance pattern suggest this allocation may warrant review — hybrid orgs commonly run leaner.",
  "Meeting Rooms": "Meeting room demand is highly pattern-dependent. Your stated preference is factored into this allocation.",
  "Collaboration": "Activity-based work models typically increase this. Consider whether your culture supports unassigned collaboration space.",
  "Support":       "Often underestimated in planning. Includes phone rooms, wellness, and circulation which directly impact employee experience."
};

const AI_SEGMENT_KEYWORDS = {
  "Desk Area":     ["desk", "seating", "assigned", "workstation", "headcount"],
  "Meeting Rooms": ["meeting", "conference", "room", "huddle"],
  "Collaboration": ["collab", "lounge", "open space", "activity"],
  "Support":       ["support", "storage", "phone room", "wellness"]
};

function getAIHighlightedSegments(aiRec) {
  if (!aiRec) return new Set();
  const text = `${aiRec.headline} ${aiRec.impact || ""} ${(aiRec.bullets || []).join(" ")}`.toLowerCase();
  const highlighted = new Set();
  Object.entries(AI_SEGMENT_KEYWORDS).forEach(([label, keywords]) => {
    if (keywords.some(k => text.includes(k))) highlighted.add(label);
  });
  return highlighted;
}

function SpaceBar({ program, aiRec }) {
  const [hovered, setHovered] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const total = program.totalSF;
  const aiHighlighted = getAIHighlightedSegments(aiRec);

  const segments = [
    {
      label: "Desk Area",
      sf: program.deskSF,
      color: BAR_COLORS[0],
      detail: [
        { label: "Desk Count", value: formatNum(program.deskCount) + " desks" },
        { label: "SF per Desk", value: formatNum(Math.round(program.deskSF / program.deskCount)) + " SF" },
        { label: "Total Desk SF", value: formatSF(program.deskSF) },
      ]
    },
    {
      label: "Meeting Rooms",
      sf: program.meetingSF,
      color: BAR_COLORS[1],
      detail: [
        { label: "Small (1–4 ppl)", value: `${program.smallRooms} rooms · ${formatSF(program.smallRooms * 120)}` },
        { label: "Medium (5–8 ppl)", value: `${program.medRooms} rooms · ${formatSF(program.medRooms * 250)}` },
        { label: "Large (9+ ppl)", value: `${program.largeRooms} rooms · ${formatSF(program.largeRooms * 450)}` },
      ]
    },
    {
      label: "Collaboration",
      sf: program.collabSF,
      color: BAR_COLORS[2],
      detail: [
        { label: "Allocation", value: "15% of desk area" },
        { label: "Total SF", value: formatSF(program.collabSF) },
        { label: "Includes", value: "Lounges, huddle areas, open collab" },
      ]
    },
    {
      label: "Support",
      sf: program.supportSF,
      color: BAR_COLORS[3],
      detail: [
        { label: "Allocation", value: "10% of desk area" },
        { label: "Total SF", value: formatSF(program.supportSF) },
        { label: "Includes", value: "Phone rooms, storage, wellness, circulation" },
      ]
    }
  ];

  return (
    <div className="bar-section">
      <h3>Space Allocation <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, letterSpacing: 0, textTransform: "none", fontSize: 10, color: "#444", marginLeft: 8 }}>hover to benchmark · click to expand</span></h3>

      {aiHighlighted.size > 0 && (
        <div style={{ fontSize: 11, color: "#c8b97a88", marginBottom: 12, fontStyle: "italic", letterSpacing: "0.04em" }}>
          ↑ AI recommendation references {[...aiHighlighted].join(" and ")} — segments highlighted below
        </div>
      )}

      <div className="bar-track" style={{ cursor: "pointer" }}>
        {segments.map((seg, i) => {
          const pct = ((seg.sf / total) * 100).toFixed(1);
          const isHovered = hovered === i;
          const isExpanded = expanded === i;
          const isAIFlagged = aiHighlighted.has(seg.label);
          return (
            <div key={i}
              className={`bar-segment ${isAIFlagged ? "ai-flagged" : ""}`}
              style={{
                width: `${pct}%`,
                background: seg.color,
                color: "#0c0e0f",
                opacity: hovered !== null && !isHovered ? 0.55 : 1,
                outline: isExpanded ? "2px solid #f0ece2" : isAIFlagged ? `2px solid ${seg.color}` : "none",
                outlineOffset: isAIFlagged ? "2px" : "-2px",
                transition: "opacity 0.2s, outline 0.15s",
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              {pct > 8 ? `${pct}%` : ""}
            </div>
          );
        })}
      </div>

      {hovered !== null && (() => {
        const seg = segments[hovered];
        const pct = parseFloat(((seg.sf / total) * 100).toFixed(1));
        const signal = getBenchmarkSignal(seg.label, pct);
        return (
          <div style={{
            background: "#1e2122",
            border: `1px solid ${seg.color}44`,
            borderLeft: `3px solid ${seg.color}`,
            borderRadius: 2,
            padding: "12px 16px",
            marginBottom: 16,
            animation: "fadeUp 0.15s ease"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 12, fontWeight: 700, color: "#e8e4dc", letterSpacing: "0.08em" }}>
                {seg.label}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {signal && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: signal.color, letterSpacing: "0.04em" }}>
                    {signal.text}
                  </span>
                )}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: seg.color }}>
                  {pct}% · {formatSF(seg.sf)}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 20 }}>
              <div>
                <div style={{ fontSize: 10, color: "#6a6760", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Industry Benchmark</div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#e8e4dc" }}>{BAR_BENCHMARKS[seg.label].range}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: "#6a6760", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Context</div>
                <div style={{ fontSize: 12, color: "#8a8478", lineHeight: 1.5 }}>{BAR_BENCHMARKS[seg.label].note}</div>
              </div>
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #1e2022", fontSize: 10, color: "#444", fontStyle: "italic", lineHeight: 1.5 }}>
              Benchmarks reflect general US corporate office norms (post-2020). Actual ranges vary by industry, market, and lease terms.
            </div>
            {aiHighlighted.has(seg.label) && aiRec && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #2a2c28", display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 10, color: "#c8b97a", letterSpacing: "0.1em", textTransform: "uppercase", flexShrink: 0, marginTop: 1 }}>AI</span>
                <span style={{ fontSize: 12, color: "#c8b97a99", fontStyle: "italic", lineHeight: 1.5 }}>
                  {AI_MICRO_INSIGHTS[seg.label] || "Referenced in your strategic recommendation above."}
                </span>
              </div>
            )}
          </div>
        );
      })()}

      {expanded !== null && (
        <div style={{
          background: "#0c0e0f",
          border: `1px solid ${segments[expanded].color}33`,
          borderTop: `2px solid ${segments[expanded].color}`,
          borderRadius: 2,
          padding: "16px 20px",
          marginBottom: 16,
          animation: "fadeUp 0.2s ease"
        }}>
          <div style={{ fontSize: 11, fontFamily: "'Syne', sans-serif", fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: segments[expanded].color, marginBottom: 12 }}>
            {segments[expanded].label} — Breakdown
          </div>
          {segments[expanded].detail.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: i < segments[expanded].detail.length - 1 ? "1px solid #1e2022" : "none" }}>
              <span style={{ fontSize: 12, color: "#6a6760" }}>{d.label}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#e8e4dc" }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className="bar-legend">
        {segments.map((seg, i) => (
          <div key={i} className="legend-item"
            style={{ cursor: "pointer", opacity: expanded === i ? 1 : 0.8 }}
            onClick={() => setExpanded(expanded === i ? null : i)}>
            <div className="legend-dot" style={{ background: seg.color }} />
            {seg.label}: {formatSF(seg.sf)}
            {aiHighlighted.has(seg.label) && (
              <span style={{ marginLeft: 4, fontSize: 9, color: "#c8b97a", letterSpacing: "0.08em" }}>AI</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioPanel({ inputs, activeStyle, activeDensity, onStyleChange, onDensityChange }) {
  const base = computeProgram(inputs, inputs.workStyle, "Balanced");
  const scenario = computeProgram(inputs, activeStyle, activeDensity);
  const city = inputs.city;
  const baseCost = getAnnualCost(base.totalSF, city);
  const scenarioCost = getAnnualCost(scenario.totalSF, city);
  const diff = scenario.totalSF - base.totalSF;
  const costDiff = scenarioCost - baseCost;

  return (
    <div className="scenario-section">
      <h3>Scenario Explorer</h3>
      <div className="scenario-row">
        <span className="scenario-label">Work Style</span>
        <div className="btn-group">
          {WORK_STYLES.map(s => (
            <button key={s} className={`btn-toggle ${activeStyle === s ? "active" : ""}`}
              onClick={() => onStyleChange(s)}>{s}</button>
          ))}
        </div>
      </div>
      <div className="scenario-row">
        <span className="scenario-label">Density</span>
        <div className="btn-group">
          {DENSITIES.map(d => (
            <button key={d} className={`btn-toggle ${activeDensity === d ? "active" : ""}`}
              onClick={() => onDensityChange(d)}>{d}</button>
          ))}
        </div>
      </div>
      <div className="scenario-compare" style={{ marginTop: 24 }}>
        <div className="scenario-col">
          <div className="scenario-col-label">Baseline ({inputs.workStyle} / Balanced)</div>
          <div className="scenario-stat"><span className="scenario-stat-label">Total SF</span><span className="scenario-stat-val">{formatSF(base.totalSF)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Desks</span><span className="scenario-stat-val">{formatNum(base.deskCount)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Annual Cost</span><span className="scenario-stat-val">{formatCost(baseCost)}</span></div>
        </div>
        <div className="scenario-col active">
          <div className="scenario-col-label active-label">{activeStyle} / {activeDensity}</div>
          <div className="scenario-stat"><span className="scenario-stat-label">Total SF</span><span className="scenario-stat-val">{formatSF(scenario.totalSF)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Desks</span><span className="scenario-stat-val">{formatNum(scenario.deskCount)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Annual Cost</span>
            <span className="scenario-stat-val" style={{ color: costDiff < 0 ? "#8bb87a" : costDiff > 0 ? "#b87a7a" : "#e8e4dc" }}>
              {costDiff !== 0 ? `${costDiff < 0 ? "-" : "+"}${formatCost(Math.abs(costDiff))}` : formatCost(scenarioCost)}
            </span>
          </div>
        </div>
      </div>
      {diff !== 0 && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: diff < 0 ? "#8bb87a11" : "#b87a7a11", borderRadius: 2, border: `1px solid ${diff < 0 ? "#8bb87a33" : "#b87a7a33"}` }}>
          <span style={{ fontSize: 13, color: diff < 0 ? "#8bb87a" : "#c8876a" }}>
            {diff < 0 ? `↓ Reduces space by ${formatSF(Math.abs(diff))} — saves ${formatCost(Math.abs(costDiff))}/yr` : `↑ Increases space by ${formatSF(diff)} — adds ${formatCost(Math.abs(costDiff))}/yr`}
          </span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [inputs, setInputs] = useState({
    headcount: null,
    workStyle: "Hybrid",
    daysInOffice: 3,
    meetingPref: "Moderate",
    city: "San Diego",
    mixedRatio: 50,
    currentSF: null
  });

  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [aiRec, setAiRec] = useState(null);
  const [scenarioStyle, setScenarioStyle] = useState("Hybrid");
  const [scenarioDensity, setScenarioDensity] = useState("Balanced");
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [capacityEstimates, setCapacityEstimates] = useState(null);
  const [effectiveHC, setEffectiveHC] = useState(null);

  const set = (k, v) => setInputs(p => ({ ...p, [k]: v }));

  const LOADING_STEPS = [
    "Analyzing occupancy patterns",
    "Modeling space requirements",
    "Generating strategic recommendation"
  ];

  const handleGenerate = async () => {
    setLoading(true);
    setLoadingStep(0);
    setScenarioOpen(false);
    setOutput(null);
    setAiRec(null);

    setTimeout(() => setLoadingStep(1), 600);
    setTimeout(() => setLoadingStep(2), 1200);

    await new Promise(r => setTimeout(r, 1800));

    // Determine effective inputs for downstream calculation.
    // If user provided SF but not HC, estimate HC at their selected work style.
    let effectiveInputs = { ...inputs };
    let capacities = null;

    if (!inputs.headcount && inputs.currentSF) {
      // SF-only mode — compute capacity at all three primary work styles
      capacities = computeCapacityFromSF(inputs.currentSF, inputs.meetingPref);
      // Use the user's selected work style estimate as the canonical HC for downstream
      const styleKey = inputs.workStyle === "Mixed" ? "Hybrid" : inputs.workStyle;
      effectiveInputs.headcount = capacities[styleKey] || capacities.Hybrid;
    }

    setCapacityEstimates(capacities);
    setEffectiveHC(effectiveInputs.headcount);

    const prog = computeProgram(effectiveInputs, effectiveInputs.workStyle, "Balanced");
    setScenarioStyle(effectiveInputs.workStyle);
    setScenarioDensity("Balanced");

    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: effectiveInputs,
          originalInputs: inputs,
          capacityEstimates: capacities,
          program: {
            totalSF: prog.totalSF,
            deskCount: prog.deskCount,
            meetingRooms: prog.meetingRooms,
            smallRooms: prog.smallRooms,
            medRooms: prog.medRooms,
            largeRooms: prog.largeRooms,
            deskRatio: prog.deskRatio,
            peakOccupancy: prog.peakOccupancy,
            annualCost: getAnnualCost(prog.totalSF, inputs.city)
          }
        })
      });

      if (!response.ok) throw new Error("API request failed");

      const data = await response.json();
      setAiRec(data);
    } catch (e) {
      // Fallback content — branches based on input combination
      const hasHC = inputs.headcount && inputs.headcount > 0;
      const hasSF = inputs.currentSF && inputs.currentSF > 0;

      if (hasHC && hasSF) {
        // Right-sizing audit fallback (HC + SF)
        const sfDelta = inputs.currentSF - prog.totalSF;
        const sfPct = Math.round((sfDelta / inputs.currentSF) * 100);
        const costDelta = getAnnualCost(Math.abs(sfDelta), inputs.city);
        const direction = sfDelta > 0 ? "oversized" : "undersized";
        const verb = sfDelta > 0 ? "avoidable" : "needed";

        setAiRec({
          headline: sfDelta > 0
            ? `You're carrying ${Math.abs(sfPct)}% more space than ${inputs.headcount} ${inputs.workStyle.toLowerCase()} employees actually need — overpaying ~${formatCost(costDelta)}/yr for unused capacity.`
            : `Your ${formatNum(inputs.currentSF)} SF footprint is undersized by ~${Math.abs(sfPct)}% for ${inputs.headcount} ${inputs.workStyle.toLowerCase()} employees — likely creating density and utilization stress.`,
          impact: sfDelta > 0
            ? `That ${formatCost(costDelta)}/yr is sitting in unused capacity. A 1:1 desk ratio is rarely justified at ${inputs.daysInOffice}-day attendance patterns.`
            : `Aligned programming would require an additional ${formatSF(Math.abs(sfDelta))} — current footprint is creating ~${formatCost(costDelta)}/yr in operational drag from over-density.`,
          bullets: [
            `Your current ${formatNum(Math.round(inputs.currentSF / inputs.headcount))} SF/person ratio runs ${Math.round(inputs.currentSF / inputs.headcount) > Math.round(prog.totalSF / inputs.headcount) ? "above" : "below"} the ${formatNum(Math.round(prog.totalSF / inputs.headcount))} SF/person benchmark for ${inputs.workStyle.toLowerCase()} programs.`,
            `Most companies at this attendance pattern overbuild large conference rooms by 2-3x — worth auditing your current room mix against actual booking data.`,
            `At ${inputs.city} market rates, every 10% of footprint variance is approximately ${formatCost(getAnnualCost(inputs.currentSF * 0.1, inputs.city))} per year on the books.`
          ]
        });
      } else if (hasSF && !hasHC) {
        // Capacity evaluation fallback (SF only)
        const cap = capacities || computeCapacityFromSF(inputs.currentSF, inputs.meetingPref);
        const range = `${cap.Assigned}–${cap.Hoteling}`;
        const annualCost = getAnnualCost(inputs.currentSF, inputs.city);

        setAiRec({
          headline: `${formatNum(inputs.currentSF)} SF in ${inputs.city} can support roughly ${range} people depending on work style — annual occupancy cost ~${formatCost(annualCost)}.`,
          impact: `At hybrid attendance, this space programs to approximately ${cap.Hybrid} people — a typical anchor for evaluating fit.`,
          bullets: [
            `Assigned seating model: ~${cap.Assigned} people. Best for assigned-desk cultures or firms with low remote adoption.`,
            `Hybrid (3 days/week): ~${cap.Hybrid} people. The most common post-2020 model and a reasonable default benchmark.`,
            `Hoteling / unassigned: ~${cap.Hoteling} people. Maximum density, requires operational maturity around desk booking and storage.`
          ]
        });
      } else {
        // Forward-looking planning fallback (HC only — original behavior)
        setAiRec({
          headline: `At ${inputs.headcount} people running ${inputs.daysInOffice}-day ${inputs.workStyle.toLowerCase()} attendance, a 1:1 desk ratio is likely overprogrammed — meaningful space and cost can be recovered without affecting employee experience.`,
          impact: `Roughly ${formatCost(getAnnualCost(prog.totalSF * 0.1, inputs.city))}/yr in occupancy cost is typically recoverable through density-aligned programming alone.`,
          bullets: [
            `Your ${inputs.daysInOffice}-day attendance pattern means peak occupancy averages around ${prog.peakOccupancy} — programming for ${inputs.headcount} desks builds in ~${Math.round((1 - prog.peakOccupancy/inputs.headcount) * 100)}% capacity that's rarely used.`,
            `Most companies overbuild large conference rooms by 2-3x — 60%+ of meetings are 2-4 people, and rooms above 8 seats are chronically underutilized.`,
            `At ${inputs.city} market rates, every 10% of footprint reduction is approximately ${formatCost(getAnnualCost(prog.totalSF * 0.1, inputs.city))}/yr — material against a ${formatCost(getAnnualCost(prog.totalSF, inputs.city))}/yr cost line.`
          ]
        });
      }
    }

    setOutput(prog);
    setLoading(false);
    setLoadingStep(0);
  };

  const handleExport = () => {
    if (!output) return;
    const prog = computeProgram(inputs, scenarioStyle, scenarioDensity);
    const cost = getAnnualCost(prog.totalSF, inputs.city);
    const baseProg = computeProgram(inputs, inputs.workStyle, "Balanced");
    const baseCost = getAnnualCost(baseProg.totalSF, inputs.city);

    const win = window.open("", "_blank");
    win.document.write(`
<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>OptiSpace Lite — Space Program Summary</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1a1a1a; padding: 60px; max-width: 860px; margin: 0 auto; }
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 24px; margin-bottom: 36px; }
  .logo { font-family: 'Syne', sans-serif; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; color: #888; margin-bottom: 12px; }
  h1 { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800; line-height: 1.1; }
  .meta { font-size: 12px; color: #888; margin-top: 8px; }
  .rec-box { background: #f8f5ed; border-left: 3px solid #c8b97a; padding: 20px 24px; margin-bottom: 32px; border-radius: 1px; }
  .rec-label { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #c8b97a; font-weight: 700; margin-bottom: 10px; }
  .rec-headline { font-family: 'Syne', sans-serif; font-size: 18px; font-weight: 700; margin-bottom: 14px; }
  .rec-bullets li { font-size: 13px; color: #444; margin-bottom: 6px; margin-left: 16px; line-height: 1.5; }
  .section-label { font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: #888; font-weight: 700; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  td { padding: 10px 0; border-bottom: 1px solid #eee; font-size: 13px; }
  td:last-child { text-align: right; font-family: 'DM Mono', monospace; font-weight: 500; }
  .compare { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
  .compare-col { border: 1px solid #eee; padding: 16px 20px; border-radius: 2px; }
  .compare-col h4 { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: #888; margin-bottom: 10px; }
  .compare-col.active { border-color: #c8b97a; }
  .compare-col.active h4 { color: #c8b97a; }
  .compare-stat { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
  .compare-stat span:last-child { font-family: 'DM Mono', monospace; }
  .footer { border-top: 1px solid #eee; padding-top: 16px; font-size: 11px; color: #aaa; display: flex; justify-content: space-between; }
</style>
</head><body>
<div class="header">
  <div class="logo">OptiSpace Lite</div>
  <h1>Space Program Summary</h1>
  <div class="meta">${inputs.city} · ${inputs.headcount} people · ${inputs.workStyle} · Generated ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
</div>

${aiRec ? `
<div class="rec-box">
  <div class="rec-label">Strategic Recommendation</div>
  <div class="rec-headline">${aiRec.headline}</div>
  <ul class="rec-bullets">${aiRec.bullets.map(b => `<li>${b}</li>`).join("")}</ul>
</div>` : ""}

<div class="section-label">Space Program</div>
<table>
  <tr><td>Total Headcount</td><td>${formatNum(inputs.headcount)}</td></tr>
  <tr><td>Peak Daily Occupancy</td><td>${formatNum(output.peakOccupancy)}</td></tr>
  <tr><td>Desk Count</td><td>${formatNum(output.deskCount)}</td></tr>
  <tr><td>Meeting Rooms</td><td>${formatNum(output.meetingRooms)} (${output.smallRooms} small · ${output.medRooms} medium · ${output.largeRooms} large)</td></tr>
  <tr><td>Desk Area</td><td>${formatSF(output.deskSF)}</td></tr>
  <tr><td>Meeting Room Area</td><td>${formatSF(output.meetingSF)}</td></tr>
  <tr><td>Collaboration</td><td>${formatSF(output.collabSF)}</td></tr>
  <tr><td>Support Spaces</td><td>${formatSF(output.supportSF)}</td></tr>
  <tr><td><strong>Total SF</strong></td><td><strong>${formatSF(output.totalSF)}</strong></td></tr>
  <tr><td>Est. Annual Occupancy Cost (${inputs.city})</td><td>${formatCost(baseCost)}/yr</td></tr>
</table>

<div class="section-label">Scenario Comparison</div>
<div class="compare">
  <div class="compare-col">
    <h4>Baseline · ${inputs.workStyle} / Balanced</h4>
    <div class="compare-stat"><span>Total SF</span><span>${formatSF(baseProg.totalSF)}</span></div>
    <div class="compare-stat"><span>Desks</span><span>${formatNum(baseProg.deskCount)}</span></div>
    <div class="compare-stat"><span>Annual Cost</span><span>${formatCost(baseCost)}</span></div>
  </div>
  <div class="compare-col active">
    <h4>Scenario · ${scenarioStyle} / ${scenarioDensity}</h4>
    <div class="compare-stat"><span>Total SF</span><span>${formatSF(prog.totalSF)}</span></div>
    <div class="compare-stat"><span>Desks</span><span>${formatNum(prog.deskCount)}</span></div>
    <div class="compare-stat"><span>Annual Cost</span><span>${formatCost(cost)}</span></div>
  </div>
</div>

<div class="footer">
  <span>Prepared with OptiSpace Lite</span>
  <span>Directional only — not a substitute for detailed programming</span>
</div>
</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 500);
  };

  const currentProg = output ? computeProgram(inputs, scenarioStyle, scenarioDensity) : null;

  return (
    <>
      <style>{STYLES_CSS}</style>
      <div className="app">
        <div className="header">
          <div className="logo">OptiSpace Lite</div>
          <h1 className="headline">Stop guessing your<br />real estate needs.</h1>
          <p className="subhead">Five inputs. A complete space program, scenario analysis, and strategic recommendation. Under 2 minutes.</p>
        </div>

        <div className="trust-block">
          <div className="trust-line">
            Built on 15 years of leading corporate real estate planning across Fortune 500 portfolios.
          </div>
          <div className="trust-divider" />
          <div className="trust-positioning">
            <div className="trust-row">
              <div className="trust-label">What this is</div>
              <div className="trust-text">A real estate and workplace strategy tool for companies before getting into the details — translating headcount, square footage, and work style into a directional starting point in under two minutes.</div>
            </div>
            <div className="trust-row">
              <div className="trust-label">What it isn't</div>
              <div className="trust-text">A substitute for broker engagement, lease economics, or the judgment of someone who actually knows your business.</div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Your Workplace</h2>
          <div className="form-grid">
            <div className="form-field">
              <label>
                Total Headcount
                <span style={{ marginLeft: 8, color: "#4a4f48", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11, fontStyle: "italic" }}>
                  optional if SF provided
                </span>
              </label>
              <input type="number" value={inputs.headcount || ""} min={0} max={10000}
                placeholder="e.g. 150"
                onChange={e => set("headcount", e.target.value === "" ? null : parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-field">
              <label>
                Current Square Footage
                <span style={{ marginLeft: 8, color: "#4a4f48", fontWeight: 400, textTransform: "none", letterSpacing: 0, fontSize: 11, fontStyle: "italic" }}>
                  optional
                </span>
              </label>
              <input type="number" value={inputs.currentSF || ""} min={0} max={10000000}
                placeholder="e.g. 22,000"
                onChange={e => set("currentSF", e.target.value === "" ? null : parseInt(e.target.value) || 0)} />
            </div>
            <div className="form-field full" style={{ marginTop: -10, marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: "#6a6760", lineHeight: 1.55, fontStyle: "italic" }}>
                Provide either, both, or one to audit your current footprint against the recommended program.
              </div>
            </div>
            <div className="form-field full">
              <label>Location</label>
              <select value={inputs.city} onChange={e => set("city", e.target.value)}>
                {Object.keys(COST_PER_SF).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field full">
              <label>Work Style</label>
              <HintButtonGroup
                options={WORK_STYLES}
                value={inputs.workStyle}
                hints={WORK_STYLE_HINTS}
                onChange={v => set("workStyle", v)}
              />
              {inputs.workStyle === "Mixed" && (
                <div style={{ marginTop: 16, background: "#0c0e0f", border: "1px solid #252820", borderRadius: 2, padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6a6760" }}>Office-Primary Population</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#c8b97a" }}>{inputs.mixedRatio}% Assigned · {100 - inputs.mixedRatio}% Hybrid</span>
                  </div>
                  <input type="range" min={10} max={90} step={5} value={inputs.mixedRatio}
                    onChange={e => set("mixedRatio", parseInt(e.target.value))}
                    style={{ width: "100%", WebkitAppearance: "none", height: 2, background: `linear-gradient(to right, #c8b97a ${inputs.mixedRatio}%, #252820 ${inputs.mixedRatio}%)`, outline: "none", cursor: "pointer" }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    <span>All Hybrid</span><span>All Assigned</span>
                  </div>
                </div>
              )}
            </div>
            {(inputs.workStyle === "Hybrid" || inputs.workStyle === "Mixed") && (
              <div className="form-field">
                <label>
                  {inputs.workStyle === "Mixed"
                    ? "Avg Days In Office / Week (Hybrid Population)"
                    : "Avg Days In Office / Week"}
                </label>
                <div className="slider-row">
                  <input type="range" min={1} max={5} value={inputs.daysInOffice}
                    onChange={e => set("daysInOffice", parseInt(e.target.value))} />
                  <span className="slider-val">{inputs.daysInOffice}</span>
                </div>
              </div>
            )}
            {inputs.workStyle === "Assigned" && (
              <div className="form-field">
                <label>Days In Office</label>
                <div style={{ padding: "10px 0", fontSize: 13, color: "#6a6760", borderLeft: "2px solid #2a2c28", paddingLeft: 10 }}>
                  Assumed 5 days/week — all employees have dedicated desks.
                </div>
              </div>
            )}
            {inputs.workStyle === "Hoteling" && (
              <div className="form-field">
                <label>Days In Office</label>
                <div style={{ padding: "10px 0", fontSize: 13, color: "#6a6760", borderLeft: "2px solid #2a2c28", paddingLeft: 10 }}>
                  Calculated at ~50% peak occupancy — typical for fully flexible environments.
                </div>
              </div>
            )}
            <div className="form-field">
              <label>Meeting Room Need</label>
              <HintButtonGroup
                options={MEETING_PREFS}
                value={inputs.meetingPref}
                hints={MEETING_PREF_HINTS}
                onChange={v => set("meetingPref", v)}
              />
            </div>
          </div>
          <button className="generate-btn" onClick={handleGenerate} disabled={loading || (!inputs.headcount && !inputs.currentSF)}>
            {loading ? (
              <span className="loading-steps">
                {LOADING_STEPS.map((step, i) => (
                  <span key={i} className={`loading-step ${i === loadingStep ? "active" : i < loadingStep ? "done" : ""}`}>
                    {step}
                    {i === loadingStep && (
                      <span className="loading-dots">
                        <span /><span /><span />
                      </span>
                    )}
                  </span>
                ))}
              </span>
            ) : "Generate Space Strategy →"}
          </button>
          {!inputs.headcount && !inputs.currentSF && (
            <div style={{ marginTop: 12, fontSize: 11, color: "#6a6760", textAlign: "center", fontStyle: "italic" }}>
              Enter headcount, square footage, or both to continue
            </div>
          )}
        </div>

        {output && (
          <div className="output-section">
            <div className="recommendation-card rec-card-anim">
              <div className="rec-label">Strategic Recommendation</div>
              <div className="rec-sublabel">{(() => {
                const hasHC = inputs.headcount && inputs.headcount > 0;
                const hasSF = inputs.currentSF && inputs.currentSF > 0;
                if (hasHC && hasSF) {
                  return `Right-Sizing Audit · ${inputs.city} · ${inputs.headcount} people · ${formatNum(inputs.currentSF)} SF current · ${inputs.workStyle}`;
                } else if (hasSF && !hasHC) {
                  return `Capacity Evaluation · ${inputs.city} · ${formatNum(inputs.currentSF)} SF · ${inputs.workStyle}`;
                } else {
                  return `AI Strategist Analysis · ${inputs.city} · ${inputs.headcount} people · ${inputs.workStyle}`;
                }
              })()}</div>
              {aiRec ? (
                <>
                  {aiRec.impact && (
                    <div className="rec-impact">{aiRec.impact}</div>
                  )}
                  <div className="rec-divider" />
                  <div className="rec-headline">{aiRec.headline}</div>
                  <ul className="rec-bullets">
                    {aiRec.bullets.map((b, i) => <li key={i}>{b}</li>)}
                  </ul>
                </>
              ) : null}
            </div>

            {(() => {
              const action = computeRecommendedAction(inputs, output);
              if (!action) return null;
              const recProg = computeProgram({ ...inputs, workStyle: action.recStyle }, action.recStyle, action.recDensity);
              const recCost = getAnnualCost(recProg.totalSF, inputs.city);
              const sfPct = Math.round((action.sfDelta / output.totalSF) * 100);

              // Compute tactical changes
              const deskDelta = output.deskCount - recProg.deskCount;
              const roomDelta = output.meetingRooms - recProg.meetingRooms;
              const largeRoomDelta = output.largeRooms - recProg.largeRooms;
              const currentSFPerDesk = Math.round(output.deskSF / output.deskCount);
              const recSFPerDesk = Math.round(recProg.deskSF / recProg.deskCount);

              return (
                <div className="action-block">
                  <div className="action-label">Recommended Action</div>
                  <div className="action-section">
                    <div className="action-section-label">Primary Move</div>
                    <div className="action-line">
                      {action.recStyle !== inputs.workStyle
                        ? `Shift to ${action.recStyle} programming — ${inputs.headcount} headcount no longer requires ${output.deskCount} dedicated desks`
                        : `Apply ${action.recDensity.toLowerCase()} density — your ${inputs.daysInOffice}-day attendance pattern doesn't justify ${currentSFPerDesk} SF/desk`}
                    </div>
                  </div>
                  <div className="action-section">
                    <div className="action-section-label">Tactical Changes</div>
                    {deskDelta > 0 && (
                      <div className="action-line">Reduce desks from {output.deskCount} to {recProg.deskCount} ({deskDelta} fewer)</div>
                    )}
                    {currentSFPerDesk !== recSFPerDesk && (
                      <div className="action-line">Target {recSFPerDesk} SF per desk (currently {currentSFPerDesk} SF)</div>
                    )}
                    {roomDelta > 0 && (
                      <div className="action-line">Reduce meeting rooms from {output.meetingRooms} to {recProg.meetingRooms} ({roomDelta} fewer)</div>
                    )}
                    {largeRoomDelta > 0 && (
                      <div className="action-line">Convert {largeRoomDelta} large conference room{largeRoomDelta > 1 ? "s" : ""} to smaller huddle spaces — large rooms above 8 seats are chronically underused</div>
                    )}
                    {deskDelta <= 0 && roomDelta <= 0 && (
                      <div className="action-line">Reallocate ~{formatSF(action.sfDelta)} from low-utilization zones to collaboration and amenity space</div>
                    )}
                  </div>
                  <div className="action-section">
                    <div className="action-section-label">Financial Impact</div>
                    <div className="action-line">Recover {formatSF(action.sfDelta)} (~{sfPct}% of current footprint)</div>
                    <div className="action-line">Stop overpaying ~{formatCost(action.costDelta)}/yr in unused capacity</div>
                  </div>
                  <div className="action-section" style={{ marginBottom: 20 }}>
                    <div className="action-section-label">Target State</div>
                    <div className="action-line" style={{ fontFamily: "'DM Mono', monospace", color: "#8bb87a", fontSize: 13 }}>
                      {formatSF(recProg.totalSF)} · {recProg.deskCount} desks · {formatCost(recCost)}/yr
                    </div>
                  </div>
                  <button className="action-apply-btn" onClick={() => {
                    setScenarioStyle(action.recStyle);
                    setScenarioDensity(action.recDensity);
                    setScenarioOpen(true);
                    setTimeout(() => {
                      document.querySelector(".scenario-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 100);
                  }}>
                    Apply this scenario →
                  </button>
                </div>
              );
            })()}

            <div className="metrics-row metrics-anim">
              {[
                { label: "Total SF", value: formatSF(currentProg.totalSF), sub: `${inputs.city}` },
                { label: "Desk Count", value: formatNum(currentProg.deskCount), sub: inputs.headcount ? `of ${inputs.headcount} headcount` : `~${effectiveHC} estimated capacity` },
                { label: "Meeting Rooms", value: formatNum(currentProg.meetingRooms), sub: `${currentProg.smallRooms}S · ${currentProg.medRooms}M · ${currentProg.largeRooms}L` },
                { label: "Annual Cost Est.", value: formatCost(getAnnualCost(currentProg.totalSF, inputs.city)), sub: "occupancy only" }
              ].map((m, i) => (
                <div key={i} className="metric-card">
                  <div className="metric-label">{m.label}</div>
                  <div className="metric-value">{m.value}</div>
                  <div className="metric-sub">{m.sub}</div>
                </div>
              ))}
            </div>

            {inputs.headcount && inputs.headcount > 0 && inputs.currentSF && inputs.currentSF > 0 && (() => {
              const sfDelta = inputs.currentSF - currentProg.totalSF;
              const sfPct = Math.round((sfDelta / inputs.currentSF) * 100);
              const costDelta = getAnnualCost(Math.abs(sfDelta), inputs.city);
              const isOversized = sfDelta > 0;
              const accentColor = isOversized ? "#c8876a" : "#7a9cb8";
              return (
                <div style={{
                  background: "#141618",
                  border: "1px solid #252820",
                  borderLeft: `3px solid ${accentColor}`,
                  borderRadius: 2,
                  padding: "24px 28px",
                  marginBottom: 32,
                  animation: "fadeUp 0.5s ease 0.35s both"
                }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: accentColor, marginBottom: 16 }}>
                    Right-Sizing Audit
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, alignItems: "baseline" }}>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6a6760", marginBottom: 6 }}>Your Current</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, color: "#e8e4dc", lineHeight: 1 }}>{formatSF(inputs.currentSF)}</div>
                      <div style={{ fontSize: 11, color: "#6a6760", marginTop: 4 }}>{Math.round(inputs.currentSF / inputs.headcount)} SF/person</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6a6760", marginBottom: 6 }}>Recommended</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, color: "#c8b97a", lineHeight: 1 }}>{formatSF(currentProg.totalSF)}</div>
                      <div style={{ fontSize: 11, color: "#6a6760", marginTop: 4 }}>{Math.round(currentProg.totalSF / inputs.headcount)} SF/person</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#6a6760", marginBottom: 6 }}>Variance</div>
                      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 22, color: accentColor, lineHeight: 1 }}>
                        {isOversized ? "+" : "−"}{Math.abs(sfPct)}%
                      </div>
                      <div style={{ fontSize: 11, color: accentColor, marginTop: 4 }}>
                        {isOversized ? `~${formatCost(costDelta)} avoidable/yr` : `~${formatCost(costDelta)} additional/yr`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {capacityEstimates && !inputs.headcount && inputs.currentSF && (() => {
              const styles = [
                { key: "Assigned", color: "#7a9cb8", note: "Traditional offices · 1:1 desk ratio" },
                { key: "Hybrid",   color: "#c8b97a", note: "3-day attendance · shared desks" },
                { key: "Hoteling", color: "#8bb87a", note: "Fully unassigned · maximum density" }
              ];
              const annualCost = getAnnualCost(inputs.currentSF, inputs.city);
              return (
                <div style={{
                  background: "#141618",
                  border: "1px solid #252820",
                  borderLeft: "3px solid #c8b97a",
                  borderRadius: 2,
                  padding: "24px 28px",
                  marginBottom: 32,
                  animation: "fadeUp 0.5s ease 0.35s both"
                }}>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#c8b97a", marginBottom: 6 }}>
                    Capacity Analysis
                  </div>
                  <div style={{ fontSize: 12, color: "#8a8478", marginBottom: 20, fontStyle: "italic" }}>
                    {formatSF(inputs.currentSF)} in {inputs.city} · {formatCost(annualCost)}/yr at current rates
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    {styles.map(s => (
                      <div key={s.key} style={{
                        background: "#0c0e0f",
                        border: "1px solid #252820",
                        borderTop: `2px solid ${s.color}`,
                        borderRadius: 2,
                        padding: "16px 18px",
                      }}>
                        <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: s.color, marginBottom: 8, fontWeight: 600 }}>
                          {s.key}
                        </div>
                        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 26, color: "#f0ece2", lineHeight: 1, marginBottom: 4 }}>
                          ~{capacityEstimates[s.key]}
                        </div>
                        <div style={{ fontSize: 11, color: "#6a6760", marginBottom: 8 }}>people</div>
                        <div style={{ fontSize: 10, color: "#6a6760", lineHeight: 1.5, fontStyle: "italic" }}>
                          {s.note}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 16, fontSize: 11, color: "#4a4f48", fontStyle: "italic", lineHeight: 1.55 }}>
                    Estimates assume {inputs.meetingPref.toLowerCase()} meeting needs. Capacity varies with your actual attendance pattern and team composition.
                  </div>
                </div>
              );
            })()}

            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1, height: 1, background: "#1e2022" }} />
                <span style={{ fontSize: 10, color: "#3a3c38", letterSpacing: "0.14em", textTransform: "uppercase", whiteSpace: "nowrap" }}>or explore manually</span>
                <div style={{ flex: 1, height: 1, background: "#1e2022" }} />
              </div>
              <button className="scenario-reveal-btn" onClick={() => setScenarioOpen(o => !o)}>
                {scenarioOpen ? "▲ Close" : "Adjust parameters manually →"}
              </button>
            </div>
            <div className={`scenario-panel ${scenarioOpen ? "open" : ""}`}>
              <ScenarioPanel inputs={inputs} activeStyle={scenarioStyle} activeDensity={scenarioDensity}
                onStyleChange={s => setScenarioStyle(s)}
                onDensityChange={d => setScenarioDensity(d)} />
              <SpaceBar program={currentProg} aiRec={aiRec} />
            </div>

            <div className="export-section">
              <h3>Export</h3>
              <div className="summary-grid">
                {[
                  ["Headcount", formatNum(inputs.headcount)],
                  ["Work Style", inputs.workStyle],
                  ["Days In Office", `${inputs.daysInOffice}/week`],
                  ["Meeting Need", inputs.meetingPref],
                  ["Total SF", formatSF(output.totalSF)],
                  ["Annual Cost", formatCost(getAnnualCost(output.totalSF, inputs.city)) + "/yr"]
                ].map(([l, v]) => (
                  <div key={l} className="summary-line">
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
              </div>
              <button className="export-btn" disabled style={{ opacity: 0.4, cursor: "not-allowed", borderColor: "#6a6760", color: "#6a6760" }}>Download Executive Summary — Coming Soon</button>
            </div>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #1e2022", fontSize: 11, color: "#4a4f48", lineHeight: 1.7, fontStyle: "italic" }}>
              Cost estimates use blended Class A/B office rates from CBRE, JLL, Cushman &amp; Wakefield, and Colliers Q1 2026 market reports. Rates current as of {COST_DATA_AS_OF}. Actual lease economics vary by submarket, building class, lease term, and concessions. OptiSpace Lite provides directional analysis only — not a substitute for broker engagement.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
