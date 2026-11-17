-- Remboursement : montant positif, rattaché au rachat d'origine.
ALTER TABLE "LedgerEntry" DROP CONSTRAINT ledger_sign_by_type;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_sign_by_type CHECK (
  (type IN ('EARN', 'BONUS', 'CHALLENGE', 'REFUND') AND amount > 0)
  OR (type IN ('REDEEM', 'EXPIRE', 'REVERSAL') AND amount < 0)
  OR (type = 'ADJUST')
);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_refund_targets_redeem CHECK (
  type <> 'REFUND' OR "reversesEntryId" IS NOT NULL
);
ALTER TABLE "RuleSet" ADD CONSTRAINT ruleset_coupon_validity CHECK ("couponValidityDays" BETWEEN 1 AND 365);
