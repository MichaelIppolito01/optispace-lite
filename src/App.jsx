import { useState, useCallback } from "react";

// Office cost per SF — blended Class A/B full-service equivalent rates, Q1 2026
// Sources: CBRE Q1 2026 Market Reports, JLL Q1 2026, Colliers Q1 2026,
// Cushman & Wakefield MarketBeats Q1 2026, CommercialCafe National Office Report Feb 2026
// Last updated: April 2026 — rates should be refreshed quarterly
const COST_PER_SF = {
  "Bay Area (Peninsula/East Bay)": 53,
  "Boston": 50,
  "Miami": 55,
  "New York (Manhattan)": 78,
  "San Francisco": 66,
  "San Jose / Silicon Valley": 55,
  "Austin": 46,
  "Los Angeles": 42,
  "Orange County": 40,
  "San Diego": 45,
  "Seattle": 47,
  "Washington, DC": 46,
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
  "Other": 35
};

// Loss factor (RSF/USF ratio) by city — based on BOMA, JLL, and CBRE market tier conventions
// Tier 1 gateway markets (NYC, SF, Boston, DC): 1.25 — high-rise multi-tenant, large core
// Tier 2 major coastal/tech (Bay Area, Seattle, LA, San Jose): 1.20
// Tier 3 standard secondary (San Diego, Austin, Denver, Chicago, Atlanta, Miami): 1.15
// Tier 4 suburban/efficient (Orange County, Raleigh, Phoenix, Nashville): 1.12
// Tier 5 affordable major metros (Cleveland, Detroit, Indianapolis, KC, etc.): 1.10
const LOSS_FACTOR = {
  // Tier 1 — Premium gateway
  "New York (Manhattan)": 1.25,
  "San Francisco": 1.25,
  "Boston": 1.25,
  "Washington, DC": 1.25,

  // Tier 2 — Major coastal & tech
  "Bay Area (Peninsula/East Bay)": 1.20,
  "San Jose / Silicon Valley": 1.20,
  "Seattle": 1.20,
  "Los Angeles": 1.20,
  "Miami": 1.20,
  "Chicago": 1.20,

  // Tier 3 — Standard secondary
  "San Diego": 1.15,
  "Austin": 1.15,
  "Denver": 1.15,
  "Atlanta": 1.15,
  "Charlotte": 1.15,
  "Dallas": 1.15,
  "Houston": 1.15,
  "Philadelphia": 1.15,
  "Minneapolis / Twin Cities": 1.15,
  "Portland, OR": 1.15,

  // Tier 4 — Suburban / efficient
  "Orange County": 1.12,
  "Raleigh-Durham": 1.12,
  "Phoenix": 1.12,
  "Nashville": 1.12,
  "Tampa": 1.12,
  "Salt Lake City": 1.12,
  "Las Vegas": 1.12,
  "Orlando": 1.12,

  // Tier 5 — Affordable major metros
  "Cleveland": 1.10,
  "Detroit": 1.10,
  "Indianapolis": 1.10,
  "Kansas City": 1.10,
  "Pittsburgh": 1.10,
  "St. Louis": 1.10,

  "Other": 1.15
};

function getLossFactor(city) {
  return LOSS_FACTOR[city] || 1.15;
}

const COST_DATA_AS_OF = "Q1 2026";
const COST_VERIFIED_DATE = "May 2026"; // Spot-checked against CBRE, Cushman & Wakefield, Colliers, Avison Young, JLL Q1 2026 reports
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
  const { headcount, daysInOffice, meetingPref, mixedRatio = 50, labUSF = 0 } = inputs;
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

  // === A&R Seats (Assigned & Reservable) ===
  const sfPerDesk = style === "Assigned" ? 150 : style === "Hybrid" ? 130 : style === "Mixed" ? 140 : 110;
  const deskSF = deskCount * sfPerDesk;

  // === Conference, Vendor, Collab Rooms ===
  const meetingMultiplier = meetingPref === "Light" ? 0.08 : meetingPref === "Moderate" ? 0.12 : 0.16;
  const meetingRooms = Math.round(headcount * meetingMultiplier);
  const smallRooms = Math.round(meetingRooms * 0.5);   // 4-6 pax
  const medRooms = Math.round(meetingRooms * 0.35);    // 8-10 pax
  const largeRooms = meetingRooms - smallRooms - medRooms; // 12-16 pax
  const phoneBooths = Math.max(2, Math.round(headcount * 0.025)); // 1 per ~40 HC, min 2
  const collabSeatingAreas = Math.max(1, Math.round(headcount * 0.008)); // open collab zones

  const meetingRoomSF = (smallRooms * 168) + (medRooms * 280) + (largeRooms * 420);
  const phoneBoothSF = phoneBooths * 20;
  const collabSeatingSF = collabSeatingAreas * 200;
  const confCollabSF = meetingRoomSF + phoneBoothSF + collabSeatingSF;

  // === Service Spaces — based on Qualcomm Americas program ratios, scaled to HC ===
  // These ratios are fixed per HC band, NOT a percent of desk SF — that's the calibration fix
  const restroomSF = Math.max(650, Math.round(headcount * 6.5));         // ~650 per restroom block, scales w/ HC
  const mechElecSF = Math.max(240, Math.round(headcount * 2.4));         // mech + elec rooms
  const copyPrintSF = Math.max(120, Math.round(headcount * 0.8));        // copy room
  const breakDiningSF = Math.round(headcount * 6 + 200);                  // break room scaling + base
  const wellnessMothersSF = headcount >= 50 ? 210 : 0;                    // mother's + wellness room (over threshold)
  const itClosetsSF = Math.max(120, Math.round(headcount * 1.2));        // IDF/MDF closets
  const storageSF = Math.max(120, Math.round(headcount * 2));            // general storage
  const serviceSF = restroomSF + mechElecSF + copyPrintSF + breakDiningSF + wellnessMothersSF + itClosetsSF + storageSF;

  // === Lab (passthrough) ===
  const labSF = Math.max(0, Math.round(labUSF) || 0);

  // === Subtotal of programmed space ===
  const programSubtotalSF = deskSF + confCollabSF + serviceSF + labSF;

  // === Circulation (33%) and Wall Thickness (3%) — calculated on subtotal ===
  const circulationSF = Math.round(programSubtotalSF * 0.33);
  const wallThicknessSF = Math.round(programSubtotalSF * 0.03);

  // === Total Usable SF ===
  const totalUSF = programSubtotalSF + circulationSF + wallThicknessSF;

  // === Total Rentable SF (per-city loss factor) ===
  const lossFactor = getLossFactor(inputs.city);
  const totalRSF = Math.round(totalUSF * lossFactor);

  return {
    peakOccupancy, deskCount, sfPerDesk,
    meetingRooms, smallRooms, medRooms, largeRooms, phoneBooths, collabSeatingAreas,
    deskSF, meetingRoomSF, phoneBoothSF, collabSeatingSF, confCollabSF,
    restroomSF, mechElecSF, copyPrintSF, breakDiningSF, wellnessMothersSF, itClosetsSF, storageSF, serviceSF,
    labSF,
    programSubtotalSF, circulationSF, wallThicknessSF,
    totalUSF, totalRSF, lossFactor,
    // Legacy aliases for backward-compat where downstream code used totalSF/collabSF/supportSF
    totalSF: totalUSF,
    meetingSF: confCollabSF,
    collabSF: collabSeatingSF,
    supportSF: serviceSF,
    presenceRatio, deskRatio
  };
}

// Naive 1:1 reference program — used as comparison baseline for HC-only mode
function computeNaiveProgram(inputs) {
  const naiveInputs = { ...inputs, workStyle: "Assigned" };
  return computeProgram(naiveInputs, "Assigned", "Balanced");
}

function estimateHCFromSF(targetRSF, workStyle, meetingPref = "Moderate", density = "Balanced", city = "Other") {
  // User-entered currentSF is treated as RSF (what they lease).
  // We binary search for the HC that produces the closest matching totalRSF.
  let low = 10, high = 5000, bestHC = low, bestDiff = Infinity;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const trial = { headcount: mid, daysInOffice: 3, meetingPref, mixedRatio: 50, workStyle, labUSF: 0, city };
    const result = computeProgram(trial, workStyle, density);
    const diff = Math.abs(result.totalRSF - targetRSF);
    if (diff < bestDiff) { bestDiff = diff; bestHC = mid; }
    if (result.totalRSF < targetRSF) low = mid + 1;
    else if (result.totalRSF > targetRSF) high = mid - 1;
    else return mid;
  }
  return bestHC;
}

function computeCapacityFromSF(targetRSF, meetingPref = "Moderate", city = "Other") {
  return {
    Assigned: estimateHCFromSF(targetRSF, "Assigned", meetingPref, "Balanced", city),
    Hybrid: estimateHCFromSF(targetRSF, "Hybrid", meetingPref, "Balanced", city),
    Hoteling: estimateHCFromSF(targetRSF, "Hoteling", meetingPref, "Balanced", city)
  };
}

function getAnnualCost(sf, city) { return sf * (COST_PER_SF[city] || 35); }
function formatNum(n) { return n?.toLocaleString() ?? "—"; }
function formatSF(n) { return `${formatNum(n)} SF`; }
function formatCost(n) { return `$${(n / 1000).toFixed(0)}K`; }
// Larger, more readable formatter: switches to $X.XXM at $1M and above
function formatCostBig(n) {
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  return `$${(n / 1000).toFixed(0)}K`;
}

const STYLES_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0c0e0f; color: #e8e4dc; font-family: 'DM Sans', sans-serif; min-height: 100vh; }
  .app { max-width: 880px; margin: 0 auto; padding: 48px 32px 80px; text-align: left; }
  .header { margin-bottom: 36px; text-align: left; }
  .logo { font-family: 'Syne', sans-serif; font-weight: 800; font-size: 13px; letter-spacing: 0.18em; text-transform: uppercase; color: #c8b97a; margin-bottom: 32px; display: flex; align-items: center; gap: 10px; }
  .logo::before { content: ''; display: inline-block; width: 6px; height: 6px; background: #c8b97a; border-radius: 50%; }
  .headline { font-family: 'Syne', sans-serif; font-weight: 800; font-size: clamp(32px, 5vw, 52px); line-height: 1.05; color: #f0ece2; margin-bottom: 16px; letter-spacing: -0.02em; }
  .subhead { font-size: 16px; color: #8a8478; font-weight: 300; line-height: 1.6; max-width: 520px; }
  .speed-claim {
    margin-top: 22px;
    margin-bottom: 4px;
    font-family: 'Syne', sans-serif;
    font-size: 22px;
    font-weight: 700;
    color: #c8b97a;
    letter-spacing: -0.005em;
    line-height: 1.2;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .speed-claim::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    background: #c8b97a;
    border-radius: 50%;
    flex-shrink: 0;
  }
  @media (max-width: 720px) {
    .speed-claim { font-size: 19px; gap: 10px; margin-top: 18px; }
    .speed-claim::before { width: 7px; height: 7px; }
  }

  .trust-block { background: #0c0e0f; border: 1px solid #1e2022; border-left: 2px solid #c8b97a; border-radius: 2px; padding: 18px 24px; margin-bottom: 32px; animation: fadeUp 0.5s ease 0.15s both; }
  .trust-line { font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.04em; color: #c8b97a; line-height: 1.6; }
  .trust-expand-btn { margin-top: 10px; padding: 4px 0; background: transparent; border: none; color: #6a6760; font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; transition: color 0.15s; display: inline-flex; align-items: center; gap: 6px; }
  .trust-expand-btn:hover { color: #c8b97a; }
  .trust-detail { overflow: hidden; max-height: 0; opacity: 0; transition: max-height 0.4s ease, opacity 0.3s ease, margin-top 0.3s ease; margin-top: 0; }
  .trust-detail.expanded { max-height: 600px; opacity: 1; margin-top: 14px; }
  .trust-divider { height: 1px; background: #1e2022; margin-bottom: 18px; }
  .trust-positioning { display: grid; gap: 14px; }
  .trust-row { display: grid; grid-template-columns: 110px 1fr; gap: 20px; align-items: baseline; }
  .trust-label { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #6a6760; line-height: 1.4; }
  .trust-text { font-size: 13px; color: #c0bbb0; line-height: 1.65; }
  @media (max-width: 720px) {
    .trust-block { padding: 16px 18px; }
    .trust-row { grid-template-columns: 1fr; gap: 4px; }
    .trust-label { font-size: 9px; }
    .trust-detail.expanded { max-height: 800px; }
  }

  .form-section { background: #141618; border: 1px solid #252820; border-radius: 2px; padding: 40px; margin-bottom: 40px; }
  .form-section h2 { font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #c8b97a; margin-bottom: 32px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
  .form-field { display: flex; flex-direction: column; gap: 10px; }
  .form-field.full { grid-column: 1 / -1; }
  .form-field label { font-size: 11px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: #6a6760; }
  .form-field input[type="number"], .form-field select { background: #0c0e0f; border: 1px solid #252820; border-radius: 2px; padding: 12px 16px; color: #e8e4dc; font-family: 'DM Mono', monospace; font-size: 15px; outline: none; transition: border-color 0.2s; width: 100%; -webkit-appearance: none; -moz-appearance: none; appearance: none; }
  .form-field select { cursor: pointer; background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%23c8b97a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5l5 5 5-5'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 16px center; background-size: 12px 8px; padding-right: 40px; }
  .form-field input:focus, .form-field select:focus { border-color: #c8b97a; }
  .form-field input::placeholder { color: #e8e4dc; font-family: 'DM Mono', monospace; font-size: 15px; letter-spacing: 0; font-style: italic; opacity: 1; }

  /* === Headcount + SF toggle side-by-side row === */
  .hc-toggle-row { padding: 0; }
  .hc-toggle-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: end;
  }
  .hc-field { display: flex; flex-direction: column; gap: 10px; }
  .hc-field label { font-size: 11px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: #6a6760; }
  .hc-field input { background: #0c0e0f; border: 1px solid #252820; border-radius: 2px; padding: 12px 16px; color: #e8e4dc; font-family: 'DM Mono', monospace; font-size: 15px; outline: none; transition: border-color 0.2s; width: 100%; -webkit-appearance: none; -moz-appearance: none; appearance: none; }
  .hc-field input:focus { border-color: #c8b97a; }
  .hc-field input::placeholder { color: #e8e4dc; font-family: 'DM Mono', monospace; font-size: 15px; letter-spacing: 0; font-style: italic; opacity: 1; }
  .sf-toggle-col { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .sf-toggle-label { font-size: 11px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: transparent; user-select: none; }
  .sf-toggle-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }

  @media (max-width: 640px) {
    .hc-toggle-grid { grid-template-columns: 1fr; gap: 14px; }
    .sf-toggle-label { display: none; }
  }

  /* === SF expand toggle — hides optional SF input until clicked === */
  .sf-toggle-wrap { padding: 0; }
  .sf-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    background: transparent;
    border: 1px dashed #2e3128;
    border-radius: 2px;
    padding: 11px 14px;
    color: #8a8478;
    font-family: 'DM Mono', monospace;
    font-size: 13px;
    font-style: italic;
    letter-spacing: 0;
    text-transform: none;
    cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    text-align: left;
  }
  .sf-toggle:hover { border-color: #c8b97a; color: #c0bbb0; }
  .sf-toggle-tag {
    font-family: 'Syne', sans-serif;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #6a6760;
    background: #1a1c1e;
    padding: 3px 8px;
    border-radius: 2px;
    border: 1px solid #2e3128;
    flex-shrink: 0;
    font-style: normal;
  }
  .sf-expand {
    overflow: hidden;
    max-height: 0;
    opacity: 0;
    transition: max-height 0.3s ease, opacity 0.25s ease, margin-top 0.25s ease;
    margin-top: 0;
  }
  .sf-expand.open {
    max-height: 80px;
    opacity: 1;
    margin-top: 10px;
  }
  .sf-expand-input {
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
  .sf-expand-input:focus { border-color: #c8b97a; }
  .sf-expand-input::placeholder { color: #6a6760; font-style: italic; }

  .btn-group { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn-toggle { padding: 10px 20px; border: 1px solid #252820; border-radius: 2px; background: transparent; color: #8a8478; font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; letter-spacing: 0.02em; }
  .btn-toggle:hover { border-color: #444; color: #e8e4dc; }
  .btn-toggle.active { background: #c8b97a; border-color: #c8b97a; color: #0c0e0f; font-weight: 600; }

  .lab-toggle-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .lab-usf-input { background: #0c0e0f !important; border: 1px solid #252820 !important; border-radius: 2px !important; padding: 10px 14px !important; color: #e8e4dc !important; font-family: 'DM Mono', monospace !important; font-size: 14px !important; outline: none !important; transition: border-color 0.2s !important; flex: 1; min-width: 140px; max-width: 200px; }
  .lab-usf-input:focus { border-color: #c8b97a !important; }

  .field-hint { margin-top: 10px; font-size: 12px; color: #6a6760; line-height: 1.55; max-height: 0; overflow: hidden; opacity: 0; transition: max-height 0.25s ease, opacity 0.2s ease; border-left: 2px solid #2a2c28; padding-left: 10px; }
  .field-hint.visible { max-height: 80px; opacity: 1; }

  .slider-row { display: flex; align-items: center; gap: 16px; }
  .slider-row input[type="range"] { flex: 1; -webkit-appearance: none; height: 2px; background: #252820; outline: none; cursor: pointer; }
  .slider-row input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; background: #c8b97a; border-radius: 50%; cursor: pointer; }
  .slider-val { font-family: 'DM Mono', monospace; font-size: 18px; font-weight: 500; color: #c8b97a; min-width: 24px; text-align: center; }

  .generate-btn { margin-top: 32px; width: 100%; padding: 18px; background: #c8b97a; border: none; border-radius: 2px; font-family: 'Syne', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: #0c0e0f; cursor: pointer; transition: background 0.3s ease, opacity 0.2s; min-height: 64px; }
  .generate-btn:hover { opacity: 0.9; }
  .generate-btn:disabled { cursor: not-allowed; background: #8a7d52; }

  .loading-steps { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .loading-step { display: block; font-size: 11px; letter-spacing: 0.08em; opacity: 0; transform: translateY(3px); transition: opacity 0.4s ease, transform 0.4s ease; text-transform: none; font-weight: 400; color: #1a160a55; font-family: 'DM Sans', sans-serif; }
  .loading-step.active { opacity: 1; transform: translateY(0); color: #1a160a; font-weight: 700; font-size: 13px; letter-spacing: 0.06em; }
  .loading-step.done { opacity: 0.3; transform: translateY(0); }
  .loading-dots { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }
  .loading-dots span { width: 4px; height: 4px; background: #1a160a; border-radius: 50%; display: inline-block; animation: loadDot 1.2s ease-in-out infinite; }
  .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
  .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes loadDot { 0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }

  .output-section { animation: fadeUp 0.4s ease; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

  /* === v1.1 Comparison Block — primary answer === */
  .comparison-block { background: #141618; border: 1px solid #252820; border-left: 3px solid #c8b97a; border-radius: 2px; padding: 32px 36px; margin-bottom: 24px; animation: fadeUp 0.5s ease both; }
  .comparison-block.audit-oversized { border-left-color: #c8876a; }
  .comparison-block.audit-undersized { border-left-color: #7a9cb8; }
  .comparison-label { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; color: #c8b97a; margin-bottom: 6px; }
  .comparison-block.audit-oversized .comparison-label { color: #c8876a; }
  .comparison-block.audit-undersized .comparison-label { color: #7a9cb8; }
  .comparison-sublabel { font-size: 11px; color: #6a6760; letter-spacing: 0.04em; margin-bottom: 24px; font-style: italic; }
  .comparison-headline { font-family: 'Syne', sans-serif; font-size: clamp(18px, 2.6vw, 22px); font-weight: 700; color: #f0ece2; line-height: 1.3; margin-bottom: 24px; letter-spacing: -0.01em; }
  .comparison-headline-savings { font-family: 'Syne', sans-serif; font-size: clamp(15px, 2.1vw, 18px); font-weight: 700; color: #c8b97a; line-height: 1.3; margin-top: -16px; margin-bottom: 24px; letter-spacing: -0.005em; }
  .comparison-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px; }

  .embedded-bar-wrap { margin-bottom: 22px; }
  .embedded-bar-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #6a6760; margin-bottom: 8px; font-weight: 600; }
  .embedded-bar-track { height: 24px; background: #0c0e0f; border-radius: 2px; display: flex; overflow: hidden; margin-bottom: 10px; }
  .embedded-bar-segment { height: 100%; transition: width 0.5s ease, opacity 0.2s; display: flex; align-items: center; justify-content: center; font-family: 'DM Mono', monospace; font-size: 9px; font-weight: 500; white-space: nowrap; overflow: hidden; cursor: default; }
  .embedded-bar-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 11px; color: #8a8478; }
  .embedded-legend-item { display: flex; align-items: center; gap: 5px; }
  @media (max-width: 720px) {
    .embedded-bar-track { height: 20px; }
    .embedded-bar-legend { gap: 10px; font-size: 10px; }
  }
  .comparison-col { background: #0c0e0f; border: 1px solid #252820; border-radius: 2px; padding: 18px 20px; }
  .comparison-col.recommended {
    background: #16170d;
    border-color: #c8b97a55;
    border-top: 3px solid #c8b97a;
    box-shadow: 0 0 0 1px #c8b97a22, 0 4px 16px rgba(200, 185, 122, 0.08);
    transform: scale(1.02);
    z-index: 1;
    position: relative;
  }
  .comparison-col.delta-savings { border-color: #8bb87a44; border-top: 2px solid #8bb87a; }
  .comparison-col.delta-cost { border-color: #c8876a44; border-top: 2px solid #c8876a; }
  .comparison-col.delta-shortage { border-color: #7a9cb844; border-top: 2px solid #7a9cb8; }
  .comparison-col-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #6a6760; margin-bottom: 10px; font-weight: 600; }
  .comparison-col.recommended .comparison-col-label { color: #c8b97a; }
  .comparison-col.delta-savings .comparison-col-label { color: #8bb87a; }
  .comparison-col.delta-cost .comparison-col-label { color: #c8876a; }
  .comparison-col.delta-shortage .comparison-col-label { color: #7a9cb8; }
  .comparison-primary-stat { font-family: 'DM Mono', monospace; font-size: 24px; color: #f0ece2; line-height: 1; margin-bottom: 6px; font-weight: 500; }
  .comparison-col.recommended .comparison-primary-stat { color: #c8b97a; font-size: 26px; }
  .comparison-col.delta-savings .comparison-primary-stat { color: #8bb87a; }
  .comparison-col.delta-cost .comparison-primary-stat { color: #c8876a; }
  .comparison-col.delta-shortage .comparison-primary-stat { color: #7a9cb8; }
  .comparison-secondary-stat { font-size: 13px; color: #a8a298; line-height: 1.5; margin-top: 2px; }

  .tactical-toggle { width: 100%; padding: 12px 16px; background: transparent; border: 1px solid #252820; border-radius: 2px; color: #8a8478; font-family: 'Syne', sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 8px; }
  .tactical-toggle:hover { border-color: #c8b97a; color: #c8b97a; }
  .expandable-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 8px; }
  .expandable-row .tactical-toggle { margin-top: 0; }
  .tactical-panel { overflow: hidden; max-height: 0; opacity: 0; transition: max-height 0.4s ease, opacity 0.3s ease, margin-top 0.3s ease; margin-top: 0; }
  .tactical-panel.open { max-height: 1200px; opacity: 1; margin-top: 16px; }
  .tactical-line { font-size: 13px; color: #c8c4bc; line-height: 1.55; padding: 8px 0 8px 18px; position: relative; border-bottom: 1px solid #1e2022; }
  .tactical-line:last-child { border-bottom: none; }
  .tactical-line::before { content: '→'; position: absolute; left: 0; color: #8bb87a; font-size: 12px; top: 8px; }

  /* === v1.1 Space Breakdown Table === */
  .breakdown-table-wrap { padding: 4px 0; }
  .breakdown-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .breakdown-table thead th { text-align: left; padding: 10px 12px; font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #6a6760; border-bottom: 1px solid #2a2c28; }
  .breakdown-table thead th.num { text-align: right; }
  .breakdown-table tbody td { padding: 12px; border-bottom: 1px solid #1e2022; vertical-align: top; color: #c8c4bc; }
  .breakdown-table tbody td.num { text-align: right; font-family: 'DM Mono', monospace; color: #e8e4dc; white-space: nowrap; }
  .breakdown-type { font-size: 13px; color: #e8e4dc; line-height: 1.4; }
  .breakdown-note { font-size: 11px; color: #6a6760; margin-top: 3px; line-height: 1.4; font-style: italic; }
  .breakdown-category td { padding: 14px 12px 8px !important; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #c8b97a !important; border-bottom: 1px solid #2a2c28 !important; }
  .breakdown-category td.num { color: #c8b97a !important; font-family: 'DM Mono', monospace !important; font-size: 12px !important; letter-spacing: 0; text-transform: none; }
  .breakdown-subtotal td { padding-top: 14px !important; border-top: 1px solid #2e3128 !important; border-bottom: 1px solid #1e2022 !important; font-size: 12px; font-weight: 600; color: #a8a298 !important; letter-spacing: 0.04em; }
  .breakdown-subtotal td.num { color: #a8a298 !important; font-family: 'DM Mono', monospace; font-size: 13px; }
  .breakdown-total td { padding-top: 14px !important; border-top: 2px solid #c8b97a !important; border-bottom: none !important; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #c8b97a !important; }
  .breakdown-total td.num { color: #c8b97a !important; font-family: 'DM Mono', monospace !important; font-size: 14px !important; letter-spacing: 0; text-transform: none; }
  .breakdown-rsf td { padding: 12px !important; border-bottom: none !important; font-family: 'Syne', sans-serif; font-weight: 700; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #8bb87a !important; }
  .breakdown-rsf td.num { color: #8bb87a !important; font-family: 'DM Mono', monospace !important; font-size: 14px !important; letter-spacing: 0; text-transform: none; }
  .breakdown-footnote { font-size: 11px; color: #6a6760; line-height: 1.55; padding: 14px 12px 4px; font-style: italic; }

  /* === v1.1 AI Interpretation — single paragraph, demoted === */
  .interpretation-block { background: #0c0e0f; border: 1px solid #1e2022; border-left: 2px solid #6a6760; border-radius: 2px; padding: 18px 22px; margin-bottom: 32px; animation: fadeUp 0.5s ease 0.15s both; }
  .interpretation-label { font-family: 'Syne', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #6a6760; margin-bottom: 8px; }
  .interpretation-text { font-size: 13px; color: #a8a298; line-height: 1.65; font-style: italic; }

  /* === Metric reference strip (smaller, persistent) === */
  .metrics-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 32px; }
  .metric-card { background: #141618; border: 1px solid #252820; border-radius: 2px; padding: 14px 16px; }
  .metric-label { font-size: 9px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6a6760; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }

  .tooltip-wrap { position: relative; display: inline-flex; align-items: center; }
  .tooltip-icon { display: inline-flex; align-items: center; justify-content: center; width: 13px; height: 13px; border-radius: 50%; border: 1px solid #4a4f48; color: #8a8478; font-size: 9px; font-weight: 600; cursor: help; transition: border-color 0.15s, color 0.15s; letter-spacing: 0; text-transform: none; font-family: 'DM Sans', sans-serif; line-height: 1; padding-bottom: 1px; }
  .tooltip-icon:hover, .tooltip-icon:focus { border-color: #c8b97a; color: #c8b97a; outline: none; }
  .tooltip-content { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%); background: #1a1c1e; border: 1px solid #2e3128; border-radius: 3px; padding: 12px 14px; width: 280px; color: #c0bbb0; font-size: 11px; font-weight: 400; letter-spacing: 0; text-transform: none; line-height: 1.55; font-family: 'DM Sans', sans-serif; opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 0.15s, visibility 0.15s; z-index: 100; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4); }
  .tooltip-content::after { content: ""; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 5px solid transparent; border-top-color: #2e3128; }
  .tooltip-wrap:hover .tooltip-content, .tooltip-icon:focus + .tooltip-content { opacity: 1; visibility: visible; }
  @media (max-width: 720px) {
    .tooltip-content { width: 240px; left: auto; right: -8px; transform: none; }
    .tooltip-content::after { left: auto; right: 12px; transform: none; }
  }

  .metric-value { font-family: 'DM Mono', monospace; font-size: 19px; font-weight: 500; color: #f0ece2; line-height: 1; }
  .metric-sub { font-size: 10px; color: #6a6760; margin-top: 4px; }

  /* === Scenario Explorer — visible by default === */
  .scenario-section { background: #141618; border: 1px solid #252820; border-radius: 2px; padding: 28px 32px; margin-bottom: 24px; }
  .scenario-section h3 { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #c8b97a; margin-bottom: 6px; }
  .scenario-section .scenario-helper { font-size: 11px; color: #6a6760; margin-bottom: 20px; font-style: italic; }
  .scenario-row { display: flex; gap: 24px; margin-bottom: 16px; align-items: center; flex-wrap: wrap; }
  .scenario-label { font-size: 12px; color: #6a6760; letter-spacing: 0.08em; text-transform: uppercase; min-width: 90px; }
  .scenario-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
  .scenario-col { background: #0c0e0f; border: 1px solid #252820; border-radius: 2px; padding: 16px 20px; }
  .scenario-col.active { border-color: #c8b97a44; }
  .scenario-col-label { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #6a6760; margin-bottom: 12px; }
  .scenario-col-label.active-label { color: #c8b97a; }
  .scenario-stat { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .scenario-stat-label { font-size: 12px; color: #6a6760; }
  .scenario-stat-val { font-family: 'DM Mono', monospace; font-size: 14px; color: #e8e4dc; }

  .bar-section { background: #141618; border: 1px solid #252820; border-radius: 2px; padding: 28px 32px; margin-bottom: 32px; overflow: visible; position: relative; }
  .bar-section h3 { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #6a6760; margin-bottom: 24px; }
  .bar-track { height: 36px; background: #0c0e0f; border-radius: 2px; display: flex; overflow: hidden; margin-bottom: 12px; }
  .bar-segment { height: 100%; transition: width 0.5s ease, opacity 0.2s; display: flex; align-items: center; justify-content: center; font-family: 'DM Mono', monospace; font-size: 10px; font-weight: 500; white-space: nowrap; overflow: hidden; cursor: pointer; }
  .bar-legend { display: flex; gap: 20px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #6a6760; }
  .legend-dot { width: 8px; height: 8px; border-radius: 1px; flex-shrink: 0; }

  .export-section { background: #141618; border: 1px solid #252820; border-radius: 2px; padding: 28px 32px; }
  .export-section h3 { font-family: 'Syne', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: #6a6760; margin-bottom: 20px; }
  .export-btn { padding: 14px 28px; background: transparent; border: 1px solid #c8b97a; border-radius: 2px; color: #c8b97a; font-family: 'Syne', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; cursor: pointer; transition: all 0.15s; }
  .export-btn:hover { background: #c8b97a; color: #0c0e0f; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  .summary-line { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #1e2022; font-size: 13px; }
  .summary-line span:first-child { color: #6a6760; }
  .summary-line span:last-child { font-family: 'DM Mono', monospace; color: #e8e4dc; }

  @media (max-width: 640px) {
    .form-grid { grid-template-columns: 1fr; }
    .metrics-row { grid-template-columns: 1fr 1fr; }
    .scenario-compare { grid-template-columns: 1fr; }
    .summary-grid { grid-template-columns: 1fr; }
    .form-section { padding: 24px; }
    .comparison-block { padding: 24px; }
    .comparison-grid { grid-template-columns: 1fr; gap: 12px; }
    .comparison-col.recommended { transform: none; }
    .expandable-row { grid-template-columns: 1fr; gap: 8px; }
    .breakdown-table { font-size: 12px; }
    .breakdown-table tbody td { padding: 10px 8px; }
    .breakdown-type { font-size: 12px; }
    .breakdown-note { font-size: 10px; }
    .app { padding: 32px 20px 60px; }
  }
`;

const BAR_COLORS = ["#c8b97a", "#7a9cb8", "#8bb87a", "#b87a9c"];

function HintButtonGroup({ options, value, hints, onChange }) {
  const [hovered, setHovered] = useState(null);
  const activeHint = hovered ? hints[hovered] : (value ? hints[value] : null);
  const showHint = !!(hovered || value);
  return (
    <div>
      <div className="btn-group">
        {options.map(o => (
          <button key={o} className={`btn-toggle ${value === o ? "active" : ""}`}
            onClick={() => onChange(o)}
            onMouseEnter={() => setHovered(o)}
            onMouseLeave={() => setHovered(null)}>{o}</button>
        ))}
      </div>
      <div className={`field-hint ${showHint ? "visible" : ""}`}>{activeHint}</div>
    </div>
  );
}

function SpaceBar({ program }) {
  const [hovered, setHovered] = useState(null);
  const total = program.totalUSF;
  const baseSegments = [
    { label: "A&R Seats", sf: program.deskSF, color: BAR_COLORS[0] },
    { label: "Conf / Collab", sf: program.confCollabSF, color: BAR_COLORS[1] },
    { label: "Service Spaces", sf: program.serviceSF, color: BAR_COLORS[2] }
  ];
  const segments = program.labSF > 0
    ? [...baseSegments, { label: "Lab", sf: program.labSF, color: BAR_COLORS[3] }, { label: "Circulation + Walls", sf: program.circulationSF + program.wallThicknessSF, color: "#5a5a52" }]
    : [...baseSegments, { label: "Circulation + Walls", sf: program.circulationSF + program.wallThicknessSF, color: "#5a5a52" }];

  return (
    <div className="bar-section">
      <h3>Space Allocation (USF)</h3>
      <div className="bar-track">
        {segments.map((seg, i) => {
          const pct = ((seg.sf / total) * 100).toFixed(1);
          const isHovered = hovered === i;
          return (
            <div key={i} className="bar-segment"
              style={{ width: `${pct}%`, background: seg.color, color: "#0c0e0f", opacity: hovered !== null && !isHovered ? 0.55 : 1 }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
              {pct > 8 ? `${pct}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="bar-legend">
        {segments.map((seg, i) => (
          <div key={i} className="legend-item">
            <div className="legend-dot" style={{ background: seg.color }} />
            {seg.label}: {formatSF(seg.sf)}
          </div>
        ))}
      </div>
    </div>
  );
}

// === v1.1 Embedded Space Bar — compact version for inside the comparison block ===
function EmbeddedSpaceBar({ program }) {
  const [hovered, setHovered] = useState(null);
  const total = program.totalUSF;
  const baseSegments = [
    { label: "A&R Seats", sf: program.deskSF, color: BAR_COLORS[0] },
    { label: "Conf / Collab", sf: program.confCollabSF, color: BAR_COLORS[1] },
    { label: "Service Spaces", sf: program.serviceSF, color: BAR_COLORS[2] }
  ];
  const segments = program.labSF > 0
    ? [...baseSegments, { label: "Lab", sf: program.labSF, color: BAR_COLORS[3] }, { label: "Circulation + Walls", sf: program.circulationSF + program.wallThicknessSF, color: "#5a5a52" }]
    : [...baseSegments, { label: "Circulation + Walls", sf: program.circulationSF + program.wallThicknessSF, color: "#5a5a52" }];

  return (
    <div className="embedded-bar-wrap">
      <div className="embedded-bar-label">Recommended program composition (USF)</div>
      <div className="embedded-bar-track">
        {segments.map((seg, i) => {
          const pct = ((seg.sf / total) * 100).toFixed(1);
          const isHovered = hovered === i;
          return (
            <div key={i} className="embedded-bar-segment"
              style={{ width: `${pct}%`, background: seg.color, color: "#0c0e0f", opacity: hovered !== null && !isHovered ? 0.55 : 1 }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}
              title={`${seg.label}: ${formatSF(seg.sf)} (${pct}%)`}>
              {pct > 10 ? `${pct}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="embedded-bar-legend">
        {segments.map((seg, i) => (
          <div key={i} className="embedded-legend-item">
            <div className="legend-dot" style={{ background: seg.color }} />
            {seg.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScenarioPanel({ inputs, activeStyle, activeDensity, onStyleChange, onDensityChange, recommendedStyle, recommendedDensity }) {
  const recommended = computeProgram({ ...inputs, workStyle: recommendedStyle }, recommendedStyle, recommendedDensity);
  const scenario = computeProgram(inputs, activeStyle, activeDensity);
  const recommendedCost = getAnnualCost(recommended.totalRSF, inputs.city);
  const scenarioCost = getAnnualCost(scenario.totalRSF, inputs.city);
  const diff = scenario.totalRSF - recommended.totalRSF;
  const costDiff = scenarioCost - recommendedCost;

  return (
    <div className="scenario-section">
      <h3>Pressure-Test the Recommendation</h3>
      <div className="scenario-helper">Adjust work style and density to compare against the recommended scenario. The recommendation is pre-loaded.</div>
      <div className="scenario-row">
        <span className="scenario-label">Work Style</span>
        <div className="btn-group">
          {WORK_STYLES.map(s => (
            <button key={s} className={`btn-toggle ${activeStyle === s ? "active" : ""}`} onClick={() => onStyleChange(s)}>{s}</button>
          ))}
        </div>
      </div>
      <div className="scenario-row">
        <span className="scenario-label">Density</span>
        <div className="btn-group">
          {DENSITIES.map(d => (
            <button key={d} className={`btn-toggle ${activeDensity === d ? "active" : ""}`} onClick={() => onDensityChange(d)}>{d}</button>
          ))}
        </div>
      </div>
      <div className="scenario-compare" style={{ marginTop: 24 }}>
        <div className="scenario-col">
          <div className="scenario-col-label">Recommended ({recommendedStyle} / {recommendedDensity})</div>
          <div className="scenario-stat"><span className="scenario-stat-label">Total RSF</span><span className="scenario-stat-val">{formatSF(recommended.totalRSF)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Total USF</span><span className="scenario-stat-val">{formatSF(recommended.totalUSF)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Desks</span><span className="scenario-stat-val">{formatNum(recommended.deskCount)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Annual Rent</span><span className="scenario-stat-val">{formatCostBig(recommendedCost)}</span></div>
        </div>
        <div className="scenario-col active">
          <div className="scenario-col-label active-label">Your Scenario ({activeStyle} / {activeDensity})</div>
          <div className="scenario-stat"><span className="scenario-stat-label">Total RSF</span><span className="scenario-stat-val">{formatSF(scenario.totalRSF)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Total USF</span><span className="scenario-stat-val">{formatSF(scenario.totalUSF)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Desks</span><span className="scenario-stat-val">{formatNum(scenario.deskCount)}</span></div>
          <div className="scenario-stat"><span className="scenario-stat-label">Annual Rent</span>
            <span className="scenario-stat-val" style={{ color: costDiff < 0 ? "#8bb87a" : costDiff > 0 ? "#b87a7a" : "#e8e4dc" }}>
              {costDiff !== 0 ? `${costDiff < 0 ? "-" : "+"}${formatCostBig(Math.abs(costDiff))}` : formatCostBig(scenarioCost)}
            </span>
          </div>
        </div>
      </div>
      {diff !== 0 && (
        <div style={{ marginTop: 16, padding: "12px 16px", background: diff < 0 ? "#8bb87a11" : "#b87a7a11", borderRadius: 2, border: `1px solid ${diff < 0 ? "#8bb87a33" : "#b87a7a33"}` }}>
          <span style={{ fontSize: 13, color: diff < 0 ? "#8bb87a" : "#c8876a" }}>
            {diff < 0 ? `↓ ${formatSF(Math.abs(diff))} less RSF than recommended — saves ${formatCostBig(Math.abs(costDiff))}/yr` : `↑ ${formatSF(diff)} more RSF than recommended — adds ${formatCostBig(Math.abs(costDiff))}/yr`}
          </span>
        </div>
      )}
    </div>
  );
}

function getRecommendedScenario(inputs) {
  const currentStyle = inputs.workStyle;
  if (currentStyle === "Assigned") return { style: "Hybrid", density: "Balanced" };
  if (currentStyle === "Hybrid" || currentStyle === "Mixed") return { style: currentStyle, density: "Aggressive" };
  return { style: "Hoteling", density: "Aggressive" };
}

function computeTacticalChanges(baselineProg, recommendedProg, baselineStyle, recommendedStyle) {
  const changes = [];
  const deskDelta = baselineProg.deskCount - recommendedProg.deskCount;
  const roomDelta = baselineProg.meetingRooms - recommendedProg.meetingRooms;
  const largeRoomDelta = baselineProg.largeRooms - recommendedProg.largeRooms;
  const baselineSFPerDesk = Math.round(baselineProg.deskSF / baselineProg.deskCount);
  const recSFPerDesk = Math.round(recommendedProg.deskSF / recommendedProg.deskCount);

  if (recommendedStyle !== baselineStyle) {
    changes.push(`Shift work style from ${baselineStyle} to ${recommendedStyle}`);
  }
  if (deskDelta > 0) {
    changes.push(`Reduce desks from ${baselineProg.deskCount} to ${recommendedProg.deskCount} (${deskDelta} fewer)`);
  } else if (deskDelta < 0) {
    changes.push(`Increase desks from ${baselineProg.deskCount} to ${recommendedProg.deskCount} (${Math.abs(deskDelta)} more)`);
  }
  if (baselineSFPerDesk !== recSFPerDesk) {
    changes.push(`Target ${recSFPerDesk} SF per desk (currently ${baselineSFPerDesk} SF)`);
  }
  if (roomDelta > 0) {
    changes.push(`Reduce meeting rooms from ${baselineProg.meetingRooms} to ${recommendedProg.meetingRooms} (${roomDelta} fewer)`);
  }
  if (largeRoomDelta > 0) {
    changes.push(`Convert ${largeRoomDelta} large conference room${largeRoomDelta > 1 ? "s" : ""} to smaller huddle spaces — large rooms above 8 seats are chronically underused`);
  }
  if (changes.length === 0) {
    changes.push("Current programming is well-aligned to the recommended scenario — no major structural changes needed");
  }
  return changes;
}

// === v1.1 Space Breakdown Table — defends the SF number ===
function SpaceBreakdownTable({ program, workStyle }) {
  const sfPerDesk = program.sfPerDesk;
  const subtotalProgram = program.programSubtotalSF;
  const totalUSF = program.totalUSF;
  const totalRSF = program.totalRSF;
  const pctOfUSF = (sf) => `${Math.round((sf / totalUSF) * 100)}%`;

  // Build rows organized by category, with category subtotals
  const arSeats = [
    {
      type: "Workstations / Desks",
      count: program.deskCount,
      sfEach: sfPerDesk,
      totalSF: program.deskSF,
      note: `${sfPerDesk} SF/desk · ${workStyle.toLowerCase()} program standard`
    }
  ];

  const confCollab = [
    program.smallRooms > 0 && {
      type: "Small meeting rooms",
      count: program.smallRooms,
      sfEach: 168,
      totalSF: program.smallRooms * 168,
      note: "4-6 person huddles"
    },
    program.medRooms > 0 && {
      type: "Medium meeting rooms",
      count: program.medRooms,
      sfEach: 280,
      totalSF: program.medRooms * 280,
      note: "8-10 person team rooms"
    },
    program.largeRooms > 0 && {
      type: "Large meeting rooms",
      count: program.largeRooms,
      sfEach: 420,
      totalSF: program.largeRooms * 420,
      note: "12-16 person conference rooms"
    },
    program.phoneBooths > 0 && {
      type: "Phone booths",
      count: program.phoneBooths,
      sfEach: 20,
      totalSF: program.phoneBoothSF,
      note: "1-person privacy booths · ~1 per 40 HC"
    },
    program.collabSeatingAreas > 0 && {
      type: "Collab seating",
      count: program.collabSeatingAreas,
      sfEach: 200,
      totalSF: program.collabSeatingSF,
      note: "Open lounge / breakout zones"
    }
  ].filter(Boolean);

  const service = [
    program.restroomSF > 0 && {
      type: "Restrooms",
      count: null, sfEach: null,
      totalSF: program.restroomSF,
      note: "Code-required, scales with HC"
    },
    program.mechElecSF > 0 && {
      type: "Mechanical / Electrical",
      count: null, sfEach: null,
      totalSF: program.mechElecSF,
      note: "Building systems rooms"
    },
    program.copyPrintSF > 0 && {
      type: "Copy / Print",
      count: null, sfEach: null,
      totalSF: program.copyPrintSF,
      note: "Centralized print + supplies"
    },
    program.breakDiningSF > 0 && {
      type: "Break / Dining",
      count: null, sfEach: null,
      totalSF: program.breakDiningSF,
      note: "Pantry, café, eating area"
    },
    program.wellnessMothersSF > 0 && {
      type: "Wellness / Mother's room",
      count: null, sfEach: null,
      totalSF: program.wellnessMothersSF,
      note: "Code-required at 50+ HC"
    },
    program.itClosetsSF > 0 && {
      type: "IT / IDF / MDF closets",
      count: null, sfEach: null,
      totalSF: program.itClosetsSF,
      note: "Telecom + network infrastructure"
    },
    program.storageSF > 0 && {
      type: "Storage",
      count: null, sfEach: null,
      totalSF: program.storageSF,
      note: "General-use storage"
    }
  ].filter(Boolean);

  const lab = program.labSF > 0 ? [{
    type: "Lab",
    count: null, sfEach: null,
    totalSF: program.labSF,
    note: "User-provided lab USF"
  }] : [];

  const renderRow = (r, i) => (
    <tr key={i}>
      <td>
        <div className="breakdown-type">{r.type}</div>
        <div className="breakdown-note">{r.note}</div>
      </td>
      <td className="num">{r.count !== null ? formatNum(r.count) : "—"}</td>
      <td className="num">{r.sfEach !== null ? formatNum(r.sfEach) : "—"}</td>
      <td className="num">{formatNum(r.totalSF)}</td>
      <td className="num">{pctOfUSF(r.totalSF)}</td>
    </tr>
  );

  const renderCategoryHeader = (label, subtotal) => (
    <tr className="breakdown-category">
      <td colSpan={3}>{label}</td>
      <td className="num">{formatNum(subtotal)}</td>
      <td className="num">{pctOfUSF(subtotal)}</td>
    </tr>
  );

  const arSeatsSubtotal = program.deskSF;
  const confCollabSubtotal = program.confCollabSF;
  const serviceSubtotal = program.serviceSF;

  return (
    <div className="breakdown-table-wrap">
      <table className="breakdown-table">
        <thead>
          <tr>
            <th>Space Type</th>
            <th className="num">Count</th>
            <th className="num">SF Each</th>
            <th className="num">USF</th>
            <th className="num">% of USF</th>
          </tr>
        </thead>
        <tbody>
          {renderCategoryHeader("Assigned & Reservable Seats", arSeatsSubtotal)}
          {arSeats.map(renderRow)}

          {renderCategoryHeader("Conference / Vendor / Collab", confCollabSubtotal)}
          {confCollab.map((r, i) => renderRow(r, `cc-${i}`))}

          {renderCategoryHeader("Service Spaces", serviceSubtotal)}
          {service.map((r, i) => renderRow(r, `sv-${i}`))}

          {lab.length > 0 && renderCategoryHeader("Lab", program.labSF)}
          {lab.map((r, i) => renderRow(r, `lab-${i}`))}

          <tr className="breakdown-subtotal">
            <td colSpan={3}>Programmed Space Subtotal</td>
            <td className="num">{formatNum(subtotalProgram)}</td>
            <td className="num">{pctOfUSF(subtotalProgram)}</td>
          </tr>
          <tr>
            <td>
              <div className="breakdown-type">+ Circulation (33%)</div>
              <div className="breakdown-note">Corridors, aisles, exit pathways — applied to subtotal</div>
            </td>
            <td className="num">—</td>
            <td className="num">—</td>
            <td className="num">{formatNum(program.circulationSF)}</td>
            <td className="num">{pctOfUSF(program.circulationSF)}</td>
          </tr>
          <tr>
            <td>
              <div className="breakdown-type">+ Wall Thickness (3%)</div>
              <div className="breakdown-note">Interior partitions and structural walls</div>
            </td>
            <td className="num">—</td>
            <td className="num">—</td>
            <td className="num">{formatNum(program.wallThicknessSF)}</td>
            <td className="num">{pctOfUSF(program.wallThicknessSF)}</td>
          </tr>
          <tr className="breakdown-total">
            <td colSpan={3}>Total Usable SF (USF)</td>
            <td className="num">{formatNum(totalUSF)}</td>
            <td className="num">100%</td>
          </tr>
          <tr className="breakdown-rsf">
            <td colSpan={3}>Total Rentable SF (RSF) · {Math.round((program.lossFactor - 1) * 100)}% loss factor</td>
            <td className="num">{formatNum(totalRSF)}</td>
            <td className="num">—</td>
          </tr>
        </tbody>
      </table>
      <div className="breakdown-footnote">
        Calibrated against JLL and CBRE 2025 occupancy planning benchmarks (132-165 USF/HC for hybrid programs) plus Fortune 500 corporate real estate program data. USF (Usable Square Feet) is what employees occupy. RSF (Rentable Square Feet) is what leases are quoted in — it adds the building's loss factor (your share of common areas like lobbies, elevator banks, and shared corridors). Loss factor varies by market: ~25% in Tier 1 gateway cities (NYC, SF, Boston, DC), ~20% in major coastal/tech markets, ~15% in standard secondary markets, ~10-12% in suburban/efficient buildings. Confirm the actual U:R ratio for your specific building with your broker.
      </div>
    </div>
  );
}

// === v1.1 Comparison Block ===
function ComparisonBlock({ inputs, recommendedScenario, tacticalOpen, setTacticalOpen, breakdownOpen, setBreakdownOpen, capacityEstimates }) {
  const hasHC = inputs.headcount && inputs.headcount > 0;
  const hasSF = inputs.currentSF && inputs.currentSF > 0;
  const recommendedProg = computeProgram({ ...inputs, workStyle: recommendedScenario.style }, recommendedScenario.style, recommendedScenario.density);
  const recommendedCost = getAnnualCost(recommendedProg.totalRSF, inputs.city);
  const recRSFPerPerson = inputs.headcount ? Math.round(recommendedProg.totalRSF / inputs.headcount) : null;

  // Mode 1: HC + SF — Right-Sizing Audit
  if (hasHC && hasSF) {
    // currentSF treated as RSF (what user leases)
    const rsfDelta = inputs.currentSF - recommendedProg.totalRSF;
    const sfPct = Math.round((rsfDelta / inputs.currentSF) * 100);
    const costDelta = getAnnualCost(Math.abs(rsfDelta), inputs.city);
    const isOversized = rsfDelta > 0;
    const blockClass = isOversized ? "audit-oversized" : "audit-undersized";
    const deltaColLabel = isOversized ? "Annual Savings" : "Capacity Shortage";
    const deltaColClass = isOversized ? "delta-cost" : "delta-shortage";
    const headlinePrimary = isOversized
      ? `You're carrying ${sfPct}% more space than you need`
      : `You're short ${Math.abs(sfPct)}% of the space you need`;
    const headlineSecondary = isOversized
      ? `${formatCostBig(recommendedCost)}/yr · ${formatCostBig(costDelta)}/yr leaner than current`
      : `${formatCostBig(recommendedCost)}/yr · ${formatCostBig(costDelta)}/yr more than current`;
    const baselineProg = computeProgram(inputs, inputs.workStyle, "Balanced");
    const tacticalChanges = computeTacticalChanges(baselineProg, recommendedProg, inputs.workStyle, recommendedScenario.style);

    return (
      <div className={`comparison-block ${blockClass}`}>
        <div className="comparison-label">Right-Sizing Audit</div>
        <div className="comparison-sublabel">{inputs.city} · {inputs.headcount} people · {formatNum(inputs.currentSF)} RSF current · {inputs.workStyle}</div>
        <div className="comparison-headline">{headlinePrimary}</div>
        <div className="comparison-headline-savings">{headlineSecondary}</div>
        <EmbeddedSpaceBar program={recommendedProg} />
        <div className="comparison-grid">
          <div className="comparison-col">
            <div className="comparison-col-label">Your Current</div>
            <div className="comparison-primary-stat">{formatNum(inputs.currentSF)} RSF</div>
            <div className="comparison-secondary-stat">{Math.round(inputs.currentSF / inputs.headcount)} SF/person · {formatCostBig(getAnnualCost(inputs.currentSF, inputs.city))}/yr</div>
          </div>
          <div className="comparison-col recommended">
            <div className="comparison-col-label">Recommended</div>
            <div className="comparison-primary-stat">{formatNum(recommendedProg.totalRSF)} RSF</div>
            <div className="comparison-secondary-stat">{formatNum(recommendedProg.totalUSF)} USF · {formatCostBig(recommendedCost)}/yr</div>
          </div>
          <div className={`comparison-col ${deltaColClass}`}>
            <div className="comparison-col-label">{deltaColLabel}</div>
            <div className="comparison-primary-stat">{isOversized ? "−" : "+"}{formatCostBig(costDelta)}/yr</div>
            <div className="comparison-secondary-stat">${Math.round(costDelta / inputs.headcount).toLocaleString()}/person/yr · {isOversized ? "−" : "+"}{Math.abs(sfPct)}% {isOversized ? "oversized" : "undersized"}</div>
          </div>
        </div>
        <div className="expandable-row">
          <button className="tactical-toggle" onClick={() => setTacticalOpen(o => !o)}>
            {tacticalOpen ? "▲ Hide what needs to change" : "▼ What needs to change"}
          </button>
          <button className="tactical-toggle" onClick={() => setBreakdownOpen(o => !o)}>
            {breakdownOpen ? "▲ Hide the math" : "▼ See the math behind this"}
          </button>
        </div>
        <div className={`tactical-panel ${tacticalOpen ? "open" : ""}`}>
          {tacticalChanges.map((change, i) => (
            <div key={i} className="tactical-line">{change}</div>
          ))}
        </div>
        <div className={`tactical-panel ${breakdownOpen ? "open" : ""}`}>
          <SpaceBreakdownTable program={recommendedProg} workStyle={recommendedScenario.style} />
        </div>
      </div>
    );
  }

  // Mode 2: SF only — Capacity Evaluation
  if (hasSF && !hasHC) {
    const cap = capacityEstimates;
    const annualCost = getAnnualCost(inputs.currentSF, inputs.city);
    const capRange = `${cap.Assigned}–${cap.Hoteling}`;
    const recProgForBar = computeProgram({ ...inputs, headcount: cap.Hybrid, workStyle: "Hybrid" }, "Hybrid", "Balanced");
    const headlinePrimary = `${formatNum(inputs.currentSF)} RSF holds ${capRange} people`;
    const headlineSecondary = `The operating model decides where you land`;

    return (
      <div className="comparison-block">
        <div className="comparison-label">Capacity Evaluation</div>
        <div className="comparison-sublabel">{inputs.city} · {formatNum(inputs.currentSF)} RSF · {formatCostBig(annualCost)}/yr at current rates</div>
        <div className="comparison-headline">{headlinePrimary}</div>
        <div className="comparison-headline-savings">{headlineSecondary}</div>
        <EmbeddedSpaceBar program={recProgForBar} />
        <div className="comparison-grid">
          <div className="comparison-col">
            <div className="comparison-col-label">Assigned</div>
            <div className="comparison-primary-stat">~{cap.Assigned}</div>
            <div className="comparison-secondary-stat">people · 1:1 desk ratio · traditional offices</div>
          </div>
          <div className="comparison-col recommended">
            <div className="comparison-col-label">Hybrid (recommended)</div>
            <div className="comparison-primary-stat">~{cap.Hybrid}</div>
            <div className="comparison-secondary-stat">people · 3-day attendance · shared desks</div>
          </div>
          <div className="comparison-col">
            <div className="comparison-col-label">Hoteling</div>
            <div className="comparison-primary-stat">~{cap.Hoteling}</div>
            <div className="comparison-secondary-stat">people · fully unassigned · max density</div>
          </div>
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "#4a4f48", fontStyle: "italic", lineHeight: 1.55 }}>
          Estimates assume {inputs.meetingPref.toLowerCase()} meeting needs and treat your input as RSF (rentable). Actual capacity varies with attendance pattern, team composition, and U:R ratio of your specific building.
        </div>
      </div>
    );
  }

  // Mode 3: HC only — Recommended Program vs traditional 1:1
  const naiveProg = computeNaiveProgram(inputs);
  const naiveCost = getAnnualCost(naiveProg.totalRSF, inputs.city);
  const rsfSavings = naiveProg.totalRSF - recommendedProg.totalRSF;
  const costSavings = naiveCost - recommendedCost;
  const savingsPct = Math.round((rsfSavings / naiveProg.totalRSF) * 100);
  const naiveRSFPerPerson = Math.round(naiveProg.totalRSF / inputs.headcount);
  const headlinePrimary = `${inputs.headcount} people need ${formatNum(recommendedProg.totalRSF)} RSF`;
  const headlineSecondary = rsfSavings > 0
    ? `${formatCostBig(recommendedCost)}/yr · ${formatCostBig(costSavings)}/yr leaner than traditional 1:1 sizing`
    : `${formatCostBig(recommendedCost)}/yr`;
  const baselineProg = computeProgram(inputs, inputs.workStyle, "Balanced");
  const tacticalChanges = computeTacticalChanges(baselineProg, recommendedProg, inputs.workStyle, recommendedScenario.style);

  return (
    <div className="comparison-block">
      <div className="comparison-label">Recommended Program</div>
      <div className="comparison-sublabel">{inputs.city} · {inputs.headcount} people · {inputs.workStyle}{inputs.workStyle !== "Assigned" && inputs.workStyle !== "Hoteling" ? ` · ${inputs.daysInOffice} days/week` : ""}{inputs.labUSF ? ` · ${formatNum(inputs.labUSF)} USF lab` : ""}</div>
      <div className="comparison-headline">{headlinePrimary}</div>
      {headlineSecondary && <div className="comparison-headline-savings">{headlineSecondary}</div>}
      <EmbeddedSpaceBar program={recommendedProg} />
      <div className="comparison-grid">
        <div className="comparison-col">
          <div className="comparison-col-label">Traditional 1:1 Sizing</div>
          <div className="comparison-primary-stat">{formatNum(naiveProg.totalRSF)} RSF</div>
          <div className="comparison-secondary-stat">{naiveRSFPerPerson} SF/person · {formatCostBig(naiveCost)}/yr</div>
        </div>
        <div className="comparison-col recommended">
          <div className="comparison-col-label">Recommended</div>
          <div className="comparison-primary-stat">{formatNum(recommendedProg.totalRSF)} RSF</div>
          <div className="comparison-secondary-stat">{formatNum(recommendedProg.totalUSF)} USF · {formatCostBig(recommendedCost)}/yr</div>
        </div>
        <div className="comparison-col delta-savings">
          <div className="comparison-col-label">Difference</div>
          <div className="comparison-primary-stat">−{formatCostBig(costSavings)}/yr</div>
          <div className="comparison-secondary-stat">${Math.round(costSavings / inputs.headcount).toLocaleString()}/person/yr · −{savingsPct}% leaner footprint</div>
        </div>
      </div>
      <div className="expandable-row">
        <button className="tactical-toggle" onClick={() => setTacticalOpen(o => !o)}>
          {tacticalOpen ? "▲ Hide what needs to change" : "▼ What needs to change"}
        </button>
        <button className="tactical-toggle" onClick={() => setBreakdownOpen(o => !o)}>
          {breakdownOpen ? "▲ Hide the math" : "▼ See the math behind this"}
        </button>
      </div>
      <div className={`tactical-panel ${tacticalOpen ? "open" : ""}`}>
        {tacticalChanges.map((change, i) => (
          <div key={i} className="tactical-line">{change}</div>
        ))}
      </div>
      <div className={`tactical-panel ${breakdownOpen ? "open" : ""}`}>
        <SpaceBreakdownTable program={recommendedProg} workStyle={recommendedScenario.style} />
      </div>
    </div>
  );
}

export default function App() {
  const [inputs, setInputs] = useState({
    headcount: null, workStyle: "Hybrid", daysInOffice: 3, meetingPref: "Moderate",
    city: "San Diego", mixedRatio: 50, currentSF: null,
    hasLab: false, labUSF: null
  });
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [aiInterpretation, setAiInterpretation] = useState(null);
  const [scenarioStyle, setScenarioStyle] = useState("Hybrid");
  const [scenarioDensity, setScenarioDensity] = useState("Balanced");
  const [recommendedScenario, setRecommendedScenario] = useState({ style: "Hybrid", density: "Balanced" });
  const [capacityEstimates, setCapacityEstimates] = useState(null);
  const [effectiveHC, setEffectiveHC] = useState(null);
  const [tacticalOpen, setTacticalOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [trustExpanded, setTrustExpanded] = useState(false);
  const [sfExpanded, setSfExpanded] = useState(false);
  const [resolvedInputs, setResolvedInputs] = useState(null);

  const set = (k, v) => setInputs(p => ({ ...p, [k]: v }));

  const LOADING_STEPS = [
    "Analyzing occupancy patterns",
    "Modeling space requirements",
    "Generating market interpretation"
  ];

  const handleGenerate = async () => {
    setLoading(true);
    setLoadingStep(0);
    setOutput(null);
    setAiInterpretation(null);
    setTacticalOpen(false);
    setBreakdownOpen(false);
    setResolvedInputs(null);

    setTimeout(() => setLoadingStep(1), 600);
    setTimeout(() => setLoadingStep(2), 1200);
    await new Promise(r => setTimeout(r, 1800));

    let effectiveInputs = { ...inputs };
    // Normalize lab USF — only include if hasLab is true
    if (!effectiveInputs.hasLab) effectiveInputs.labUSF = 0;
    let capacities = null;

    if (!inputs.headcount && inputs.currentSF) {
      capacities = computeCapacityFromSF(inputs.currentSF, inputs.meetingPref, inputs.city);
      const styleKey = inputs.workStyle === "Mixed" ? "Hybrid" : inputs.workStyle;
      effectiveInputs.headcount = capacities[styleKey] || capacities.Hybrid;
    }

    setCapacityEstimates(capacities);
    setEffectiveHC(effectiveInputs.headcount);
    setResolvedInputs(effectiveInputs);

    const recScenario = getRecommendedScenario(effectiveInputs);
    setRecommendedScenario(recScenario);

    const recProg = computeProgram({ ...effectiveInputs, workStyle: recScenario.style }, recScenario.style, recScenario.density);

    setScenarioStyle(recScenario.style);
    setScenarioDensity(recScenario.density);

    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputs: effectiveInputs,
          originalInputs: inputs,
          capacityEstimates: capacities,
          recommendedScenario: recScenario,
          program: {
            totalUSF: recProg.totalUSF,
            totalRSF: recProg.totalRSF,
            totalSF: recProg.totalUSF, // legacy alias for backward compat
            deskCount: recProg.deskCount,
            meetingRooms: recProg.meetingRooms,
            smallRooms: recProg.smallRooms,
            medRooms: recProg.medRooms,
            largeRooms: recProg.largeRooms,
            deskRatio: recProg.deskRatio,
            peakOccupancy: recProg.peakOccupancy,
            lossFactor: recProg.lossFactor,
            annualCost: getAnnualCost(recProg.totalRSF, inputs.city)
          }
        })
      });
      if (!response.ok) throw new Error("API request failed");
      const data = await response.json();
      setAiInterpretation(data.interpretation || data.headline || null);
    } catch (e) {
      const hasHC = inputs.headcount && inputs.headcount > 0;
      const hasSF = inputs.currentSF && inputs.currentSF > 0;

      if (hasHC && hasSF) {
        const rsfPerPerson = Math.round(inputs.currentSF / inputs.headcount);
        // JLL 2025 benchmark of 132-165 SF/HC refers to programmed/usable space.
        // Once circulation (33%), walls (3%), and loss factor (12%) stack on top, real RSF runs ~50% higher.
        // So the RSF benchmarks become roughly: Hybrid ~200, Assigned ~300, Hoteling ~160
        const benchmark = inputs.workStyle === "Hybrid" ? 200 : inputs.workStyle === "Assigned" ? 300 : 160;
        const direction = rsfPerPerson > benchmark + 20 ? "above" : rsfPerPerson < benchmark - 20 ? "below" : "near";
        setAiInterpretation(
          `At ${rsfPerPerson} RSF/person you sit ${direction} the typical ${benchmark} RSF/person range for ${inputs.workStyle.toLowerCase()} programs once circulation, walls, and the building's loss factor are accounted for (JLL 2025 benchmarks of 132-165 USF/HC for hybrid grossing up to ~200 RSF in real buildings). Most underwater audits trace back to conference room overbuilding, where 60%+ of actual meetings are 2-4 people while rooms above 8 seats sit chronically underused. ${inputs.city} sublease availability through ${COST_DATA_AS_OF} continues to favor tenants, sharpening the leverage on any right-sizing decision made now.`
        );
      } else if (hasSF && !hasHC) {
        setAiInterpretation(
          `Capacity ranges this wide aren't a calculation artifact — they reflect a real choice about operational maturity. Hoteling-grade density (per JLL 2025, 132 USF/HC programmed, ~160 RSF/HC after gross-up) requires booking systems, locker programs, and a culture that's already past the assigned-seat default; firms that skip those investments end up paying for the RSF without capturing the savings.`
        );
      } else {
        setAiInterpretation(
          `Traditional 1:1 sizing assumes every employee occupies a desk simultaneously, but peak occupancy for ${inputs.daysInOffice}-day hybrid populations runs around ${Math.round((inputs.daysInOffice / 5) * 100)}% — a third of dedicated desks sit empty on any given day. JLL's 2025 benchmarks show hybrid programs targeting 132-165 USF/HC (programmed) or roughly 200 RSF/HC after circulation, walls, and the building's loss factor stack on top — down meaningfully from the pre-2020 assigned-seat standard of 225 USF/HC.`
        );
      }
    }

    setOutput(recProg);
    setLoading(false);
    setLoadingStep(0);
  };

  const currentProg = output && resolvedInputs ? computeProgram(resolvedInputs, scenarioStyle, scenarioDensity) : null;

  return (
    <>
      <style>{STYLES_CSS}</style>
      <div className="app">
        <div className="header">
          <div className="logo">OptiSpace Lite</div>
          <h1 className="headline">Stop guessing your<br />real estate needs.</h1>
          <p className="subhead">Headcount in. Defensible space program out — with cost, capacity, and the math behind it.</p>
          <div className="speed-claim">Under 30 seconds.</div>
        </div>

        <div className="trust-block">
          <div className="trust-line">Built on 15 years of corporate real estate planning across Fortune 500 portfolios.</div>
          <button className="trust-expand-btn" onClick={() => setTrustExpanded(e => !e)}>
            {trustExpanded ? "▲ Hide details" : "▼ How this tool works"}
          </button>
          <div className={`trust-detail ${trustExpanded ? "expanded" : ""}`}>
            <div className="trust-divider" />
            <div className="trust-positioning">
              <div className="trust-row">
                <div className="trust-label">What this is</div>
                <div className="trust-text">A directional sizing tool — translating headcount, square footage, and work style into a defensible USF and RSF range with a programmed space breakdown, in under two minutes. Calibrated against JLL and CBRE 2025 occupancy planning benchmarks and structural patterns from Fortune 500 corporate real estate programs.</div>
              </div>
              <div className="trust-row">
                <div className="trust-label">What it isn't</div>
                <div className="trust-text">A substitute for detailed space programming, broker engagement, lease economics, or the judgment of a planner with knowledge of your business, building, and local code requirements.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Your Workplace</h2>
          <div className="form-grid">
            <div className="form-field full hc-toggle-row">
              <div className="hc-toggle-grid">
                <div className="hc-field">
                  <label>Total Headcount</label>
                  <input type="number" value={inputs.headcount || ""} min={0} max={10000} placeholder="e.g. 150"
                    onChange={e => set("headcount", e.target.value === "" ? null : parseInt(e.target.value) || 0)} />
                </div>
                <div className="sf-toggle-col">
                  <label className="sf-toggle-label">&nbsp;</label>
                  <button
                    type="button"
                    className="sf-toggle"
                    onClick={() => setSfExpanded(e => !e)}>
                    <span className="sf-toggle-text">{sfExpanded ? "− Hide footprint" : "+ Compare footprint"}</span>
                    <span className="sf-toggle-tag">OPTIONAL</span>
                  </button>
                </div>
              </div>
              <div className={`sf-expand ${sfExpanded ? "open" : ""}`}>
                <input type="number" className="sf-expand-input" value={inputs.currentSF || ""} min={0} max={10000000} placeholder="Current RSF · e.g. 22,000"
                  onChange={e => set("currentSF", e.target.value === "" ? null : parseInt(e.target.value) || 0)} />
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
              <HintButtonGroup options={WORK_STYLES} value={inputs.workStyle} hints={WORK_STYLE_HINTS} onChange={v => set("workStyle", v)} />
              {inputs.workStyle === "Mixed" && (
                <div style={{ marginTop: 16, background: "#0c0e0f", border: "1px solid #252820", borderRadius: 2, padding: "16px 20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#6a6760" }}>Office-Primary Population</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#c8b97a" }}>{inputs.mixedRatio}% Assigned · {100 - inputs.mixedRatio}% Hybrid</span>
                  </div>
                  <input type="range" min={10} max={90} step={5} value={inputs.mixedRatio}
                    onChange={e => set("mixedRatio", parseInt(e.target.value))}
                    style={{ width: "100%", WebkitAppearance: "none", height: 2, background: `linear-gradient(to right, #c8b97a ${inputs.mixedRatio}%, #252820 ${inputs.mixedRatio}%)`, outline: "none", cursor: "pointer" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 10, color: "#444", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    <span>All Hybrid</span><span>All Assigned</span>
                  </div>
                </div>
              )}
            </div>
            {(inputs.workStyle === "Hybrid" || inputs.workStyle === "Mixed") && (
              <div className="form-field">
                <label>{inputs.workStyle === "Mixed" ? "Avg Days In Office / Week (Hybrid Population)" : "Avg Days In Office / Week"}</label>
                <div className="slider-row">
                  <input type="range" min={1} max={5} value={inputs.daysInOffice} onChange={e => set("daysInOffice", parseInt(e.target.value))} />
                  <span className="slider-val">{inputs.daysInOffice}</span>
                </div>
              </div>
            )}
            {inputs.workStyle === "Assigned" && (
              <div className="form-field">
                <label>Days In Office</label>
                <div style={{ padding: "10px 0", fontSize: 13, color: "#6a6760", borderLeft: "2px solid #2a2c28", paddingLeft: 10 }}>Assumed 5 days/week — all employees have dedicated desks.</div>
              </div>
            )}
            {inputs.workStyle === "Hoteling" && (
              <div className="form-field">
                <label>Days In Office</label>
                <div style={{ padding: "10px 0", fontSize: 13, color: "#6a6760", borderLeft: "2px solid #2a2c28", paddingLeft: 10 }}>Calculated at ~50% peak occupancy — typical for fully flexible environments.</div>
              </div>
            )}
            <div className="form-field">
              <label>Meeting Room Need</label>
              <HintButtonGroup options={MEETING_PREFS} value={inputs.meetingPref} hints={MEETING_PREF_HINTS} onChange={v => set("meetingPref", v)} />
            </div>
            <div className="form-field full">
              <label>Lab space</label>
              <div className="lab-toggle-row">
                <button
                  className={`btn-toggle ${!inputs.hasLab ? "active" : ""}`}
                  onClick={() => { set("hasLab", false); set("labUSF", null); }}>None</button>
                <button
                  className={`btn-toggle ${inputs.hasLab ? "active" : ""}`}
                  onClick={() => set("hasLab", true)}>Yes — add lab USF</button>
                {inputs.hasLab && (
                  <input
                    type="number"
                    className="lab-usf-input"
                    placeholder="e.g. 5,000"
                    value={inputs.labUSF || ""}
                    min={0} max={500000}
                    onChange={e => set("labUSF", e.target.value === "" ? null : parseInt(e.target.value) || 0)} />
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "#6a6760", fontStyle: "italic", lineHeight: 1.5 }}>
                If the program includes lab space, enter the lab USF directly. Lab programs require specialized planning beyond the scope of this tool — this just adds the USF to the total.
              </div>
            </div>
          </div>
          <button className="generate-btn" onClick={handleGenerate} disabled={loading || (!inputs.headcount && !inputs.currentSF)}>
            {loading ? (
              <span className="loading-steps">
                {LOADING_STEPS.map((step, i) => (
                  <span key={i} className={`loading-step ${i === loadingStep ? "active" : i < loadingStep ? "done" : ""}`}>
                    {step}
                    {i === loadingStep && (<span className="loading-dots"><span /><span /><span /></span>)}
                  </span>
                ))}
              </span>
            ) : "Generate Space Strategy →"}
          </button>
          {!inputs.headcount && !inputs.currentSF && (
            <div style={{ marginTop: 12, fontSize: 11, color: "#6a6760", textAlign: "center", fontStyle: "italic" }}>Enter headcount, square footage, or both to continue</div>
          )}
        </div>

        {output && (
          <div className="output-section">
            {/* === 1. PRIMARY ANSWER === */}
            <ComparisonBlock
              inputs={inputs}
              recommendedScenario={recommendedScenario}
              tacticalOpen={tacticalOpen}
              setTacticalOpen={setTacticalOpen}
              breakdownOpen={breakdownOpen}
              setBreakdownOpen={setBreakdownOpen}
              capacityEstimates={capacityEstimates}
            />

            {/* === 2. AI INTERPRETATION === */}
            {aiInterpretation && (
              <div className="interpretation-block">
                <div className="interpretation-label">Market Context</div>
                <div className="interpretation-text">{aiInterpretation}</div>
              </div>
            )}

            {/* === 3. METRIC REFERENCE STRIP === */}
            <div className="metrics-row">
              {[
                { label: "Total RSF", value: formatSF(currentProg.totalRSF), sub: `${formatNum(currentProg.totalUSF)} USF` },
                { label: "Desk Count", value: formatNum(currentProg.deskCount), sub: inputs.headcount ? `of ${inputs.headcount} HC` : `~${effectiveHC} est. capacity` },
                { label: "Meeting Rooms", value: formatNum(currentProg.meetingRooms), sub: `${currentProg.smallRooms}S · ${currentProg.medRooms}M · ${currentProg.largeRooms}L` },
                { label: "Annual Rent Est.", value: formatCostBig(getAnnualCost(currentProg.totalRSF, inputs.city)), sub: "base rent on RSF",
                  tooltip: "Base rent only. Calculated as Total RSF × the city's blended Class A/B asking rate (Q1 2026). Most leases are quoted in RSF. Excludes operating expenses, utilities, janitorial, IT, FF&E, tenant improvements, and brokerage fees. Add 30–50% for fully loaded occupancy cost." }
              ].map((m, i) => (
                <div key={i} className="metric-card">
                  <div className="metric-label">
                    {m.label}
                    {m.tooltip && (
                      <span className="tooltip-wrap">
                        <span className="tooltip-icon" tabIndex={0} aria-label="What's included">?</span>
                        <span className="tooltip-content" role="tooltip">{m.tooltip}</span>
                      </span>
                    )}
                  </div>
                  <div className="metric-value">{m.value}</div>
                  <div className="metric-sub">{m.sub}</div>
                </div>
              ))}
            </div>

            {/* === 4. SCENARIO EXPLORER (visible by default) === */}
            <ScenarioPanel
              inputs={resolvedInputs || inputs}
              activeStyle={scenarioStyle}
              activeDensity={scenarioDensity}
              onStyleChange={s => setScenarioStyle(s)}
              onDensityChange={d => setScenarioDensity(d)}
              recommendedStyle={recommendedScenario.style}
              recommendedDensity={recommendedScenario.density}
            />

            {/* === 5. EXPORT === */}
            <div className="export-section">
              <h3>Export</h3>
              <div className="summary-grid">
                {[
                  ["Headcount", formatNum(inputs.headcount || effectiveHC)],
                  ["Work Style", inputs.workStyle],
                  ["Days In Office", `${inputs.daysInOffice}/week`],
                  ["Meeting Need", inputs.meetingPref],
                  ...(inputs.hasLab && inputs.labUSF ? [["Lab USF", formatSF(inputs.labUSF)]] : []),
                  ["Total USF", formatSF(output.totalUSF)],
                  ["Total RSF", formatSF(output.totalRSF)],
                  ["Annual Rent (RSF)", formatCostBig(getAnnualCost(output.totalRSF, inputs.city)) + "/yr"]
                ].map(([l, v]) => (
                  <div key={l} className="summary-line">
                    <span>{l}</span><span>{v}</span>
                  </div>
                ))}
              </div>
              <button className="export-btn" disabled style={{ opacity: 0.4, cursor: "not-allowed", borderColor: "#6a6760", color: "#6a6760" }}>Download Executive Summary — Coming Soon</button>
            </div>

            <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid #1e2022", fontSize: 11, color: "#4a4f48", lineHeight: 1.7, fontStyle: "italic" }}>
              Cost estimates use blended Class A/B office rates from CBRE, JLL, Cushman &amp; Wakefield, Avison Young, and Colliers Q1 2026 market reports. Rates current as of {COST_DATA_AS_OF}, last verified {COST_VERIFIED_DATE}, applied to Total RSF. Actual lease economics vary by submarket, building class, lease term, and concessions. OptiSpace Lite provides directional analysis only — not a substitute for broker engagement, design programming, or detailed space planning.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
