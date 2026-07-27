export const WEEKLY_PLAN_RECEIPT_SCHEMA_VERSION = "1.0";

function decisionSummary(choice) {
  if (!choice) return null;
  return {
    decisionId: choice.decisionId || null,
    choiceId: choice.choiceId || null,
    occurrenceKey: choice.occurrenceKey || null
  };
}

function previewReceipt({ status, compositionOrder, decisionChoice, tacticId, phase, review = null }) {
  return {
    schemaVersion: WEEKLY_PLAN_RECEIPT_SCHEMA_VERSION,
    kind: "weekly-plan-preview",
    status,
    phase: phase || "unknown",
    compositionOrder,
    plan: {
      gmDecision: decisionSummary(decisionChoice),
      tacticId: tacticId || null,
      explicitNoPlan: phase === "regular-season" && !tacticId
    },
    review
  };
}

export async function composeWeeklyPlan({
  phase = "unknown",
  presetDecisionChoice = null,
  collectDecision = async () => ({ status: "none", choice: null }),
  collectTactic = async () => null,
  reviewPlan = null,
  onCheckpoint = () => {}
} = {}) {
  const regularSeason = phase === "regular-season";
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
          phase
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
  if (regularSeason) {
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
        phase
      }));
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
            review: reviewReceipt?.evidence || null
          })
        };
      }
      review = reviewReceipt.evidence || { reviewed: true };
      onCheckpoint("weekly-plan-reviewed");
      break;
    }
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
  const tactic = receipt.plan?.tacticId ? `tactic ${receipt.plan.tacticId}` : "explicit no-plan";
  if (receipt.status === "deferred") {
    return { title: "Weekly plan deferred", detail: "No command was committed.", tone: "warning" };
  }
  const reviewSource = receipt.review?.counterSignalSource
    ? ` · reviewed against ${String(receipt.review.counterSignalSource).slice(0, 80)}`
    : "";
  return {
    title: receipt.status === "committed" ? "Weekly plan committed" : "Weekly plan staged",
    detail: `${decision} · ${tactic}${reviewSource} · ${receipt.compositionOrder.join(" → ") || "phase-only command"}`,
    tone: receipt.status === "committed" ? "positive" : "accent"
  };
}
