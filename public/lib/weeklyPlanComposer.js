export const WEEKLY_PLAN_RECEIPT_SCHEMA_VERSION = "1.0";

function decisionSummary(choice) {
  if (!choice) return null;
  return {
    decisionId: choice.decisionId || null,
    choiceId: choice.choiceId || null,
    occurrenceKey: choice.occurrenceKey || null
  };
}

// S102 — a bye is a week, not a missing game: it suppresses the tactic step
// (there is no opponent to plan for) and carries its own beat instead of
// returning nothing. Full defect narrative in session102-staff-and-bye.test.js;
// this module is in the initial boot graph, so the prose lives in the test.
export const BYE_WEEK_BEAT = Object.freeze({
  id: "bye-week",
  kind: "rest",
  headline: "Bye week — no game to plan",
  detail:
    "No opponent this week. The staff banks the rest and the game plan waits; your next tactical call is the week after."
});

function previewReceipt({
  status,
  compositionOrder,
  decisionChoice,
  tacticId,
  phase,
  tacticalPhase = false,
  onBye = false,
  review = null
}) {
  return {
    schemaVersion: WEEKLY_PLAN_RECEIPT_SCHEMA_VERSION,
    kind: "weekly-plan-preview",
    status,
    phase: phase || "unknown",
    onBye,
    beat: onBye ? BYE_WEEK_BEAT : null,
    compositionOrder,
    plan: {
      gmDecision: decisionSummary(decisionChoice),
      tacticId: tacticId || null,
      // A bye has no tactic to withhold, so it is not an "explicit no-plan".
      explicitNoPlan: tacticalPhase && !onBye && !tacticId
    },
    review
  };
}

export async function composeWeeklyPlan({
  phase = "unknown",
  postseasonPlanRequired = false,
  presetDecisionChoice = null,
  collectDecision = async () => ({ status: "none", choice: null }),
  collectTactic = async () => null,
  onBye = false,
  reviewPlan = null,
  onCheckpoint = () => {}
} = {}) {
  const regularSeason = phase === "regular-season";
  const onByeWeek = Boolean(onBye) && regularSeason;
  const tacticalPhase = (regularSeason && !onByeWeek) || (phase === "postseason" && postseasonPlanRequired);
  const compositionOrder = [];
  let decisionChoice = presetDecisionChoice || null;
  onCheckpoint("weekly-plan-opened");

  if (regularSeason && !decisionChoice) {
    compositionOrder.push("gm-decision");
    const decision = await collectDecision();
    if (decision?.status === "deferred") {
      return {
        deferred: true,
        body: null,
        receipt: previewReceipt({
          status: "deferred",
          compositionOrder,
          decisionChoice: null,
          tacticId: null,
          phase,
          tacticalPhase,
          onBye: onByeWeek
        })
      };
    }
    if (decision?.status === "chosen") decisionChoice = decision.choice;
    onCheckpoint("gm-decision-resolved");
  } else if (regularSeason && decisionChoice) {
    compositionOrder.push("gm-decision-staged");
    onCheckpoint("gm-decision-resolved");
  }

  let tacticId = null;
  let review = null;
  if (tacticalPhase) {
    let revising = false;
    while (true) {
      compositionOrder.push(revising ? "tactic-revision" : "tactic");
      tacticId = await collectTactic();
      onCheckpoint("tactic-resolved");
      if (typeof reviewPlan !== "function") break;
      compositionOrder.push("review");
      const reviewReceipt = await reviewPlan(previewReceipt({
        status: "review",
        compositionOrder: [...compositionOrder],
        decisionChoice,
        tacticId,
        phase,
        tacticalPhase,
        onBye: onByeWeek
      }));
      if (reviewReceipt?.mode === "standing-reinforcement") {
        compositionOrder[compositionOrder.length - 1] = "standing-plan-reinforced";
      }
      const reviewStatus = reviewReceipt?.status || "deferred";
      if (reviewStatus === "revise") {
        compositionOrder.push("review-revise");
        onCheckpoint("weekly-plan-revision-requested");
        revising = true;
        continue;
      }
      if (reviewStatus !== "commit") {
        onCheckpoint("weekly-plan-deferred");
        return {
          deferred: true,
          body: null,
          receipt: previewReceipt({
            status: "deferred",
            compositionOrder,
            decisionChoice,
            tacticId,
            phase,
            tacticalPhase,
            onBye: onByeWeek,
            review: reviewReceipt?.evidence || null
          })
        };
      }
      review = reviewReceipt.evidence || { reviewed: true };
      onCheckpoint("weekly-plan-reviewed");
      break;
    }
  }

  if (onByeWeek) {
    compositionOrder.push("bye");
    onCheckpoint("bye-week-acknowledged");
  }

  const body = { count: 1 };
  if (decisionChoice) body.gmDecisionChoice = decisionChoice;
  if (tacticId) body.weeklyTacticOverride = tacticId;
  return {
    deferred: false,
    body,
    receipt: previewReceipt({
      status: "ready",
      compositionOrder,
      decisionChoice,
      tacticId,
      phase,
      tacticalPhase,
      onBye: onByeWeek,
      review
    })
  };
}

export function commitWeeklyPlanReceipt(receipt, response = {}) {
  if (receipt?.schemaVersion !== WEEKLY_PLAN_RECEIPT_SCHEMA_VERSION) return null;
  return {
    ...receipt,
    kind: "weekly-plan-commit-receipt",
    status: "committed",
    authority: {
      year: response.state?.currentYear ?? response.currentYear ?? null,
      week: response.state?.currentWeek ?? response.currentWeek ?? null,
      teamId: response.state?.controlledTeamId ?? response.controlledTeamId ?? null
    },
    observed: {
      gmDecisionApplied: response.gmDecision?.applied === true,
      architectReceiptId: response.architectEntry?.id || null
    },
    disclaimer: "This receipt proves composition and commit order. It does not claim the plan caused the result."
  };
}

export function describeWeeklyPlanReceipt(receipt) {
  if (!receipt) return null;
  const decision = receipt.plan?.gmDecision?.choiceId ? "GM choice" : "no GM choice";
  // On a bye there was no tactic to give, so "explicit no-plan" would describe
  // a refusal that never happened.
  const tactic = receipt.plan?.tacticId
    ? `tactic ${receipt.plan.tacticId}`
    : receipt.onBye
      ? "bye week — no opponent"
      : "explicit no-plan";
  if (receipt.status === "deferred") {
    return { title: "Weekly plan deferred", detail: "No command was committed.", tone: "warning" };
  }
  if (receipt.onBye) {
    return {
      title: receipt.status === "committed" ? "Bye week committed" : "Bye week staged",
      detail: `${decision} · ${tactic} · ${receipt.compositionOrder.join(" → ") || "phase-only command"}`,
      tone: "accent"
    };
  }
  const reviewSource = receipt.review?.counterSignalSource
    ? ` · reviewed against ${String(receipt.review.counterSignalSource).slice(0, 80)}`
    : "";
  const reinforcement = receipt.review?.mode === "standing-reinforcement"
    ? ` · reinforced from ${receipt.review.sourceReceiptId || "last executed film"}`
    : reviewSource;
  return {
    title: receipt.status === "committed" ? "Weekly plan committed" : "Weekly plan staged",
    detail: `${decision} · ${tactic}${reinforcement} · ${receipt.compositionOrder.join(" → ") || "phase-only command"}`,
    tone: receipt.status === "committed" ? "positive" : "accent"
  };
}
