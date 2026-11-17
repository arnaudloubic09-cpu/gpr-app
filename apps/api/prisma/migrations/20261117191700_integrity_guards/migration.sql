-- Garanties métier côté base de données (en plus de la validation applicative).

-- 1. Grand livre et journal d'audit IMMUABLES : aucune modification ni suppression.
CREATE OR REPLACE FUNCTION gpr_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'La table % est immuable (opération % interdite)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_immutable
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION gpr_forbid_mutation();

CREATE TRIGGER ledger_entry_no_truncate
  BEFORE TRUNCATE ON "LedgerEntry"
  FOR EACH STATEMENT EXECUTE FUNCTION gpr_forbid_mutation();

CREATE TRIGGER audit_log_immutable
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION gpr_forbid_mutation();

-- 2. Cohérence des écritures du ledger.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_amount_not_zero CHECK (amount <> 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_sign_by_type CHECK (
  (type IN ('EARN', 'BONUS', 'CHALLENGE') AND amount > 0)
  OR (type IN ('REDEEM', 'EXPIRE', 'REVERSAL') AND amount < 0)
  OR (type = 'ADJUST')
);
-- Un ajustement manuel exige un motif et un auteur.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT ledger_adjust_has_reason CHECK (
  type <> 'ADJUST' OR (reason IS NOT NULL AND length(trim(reason)) > 0 AND "authorId" IS NOT NULL)
);

-- 3. Récompenses : catégories et formats autorisés uniquement.
-- (L'enum RewardCategory ne contient déjà aucune catégorie « réservation / partie ».)
ALTER TABLE "Reward" ADD CONSTRAINT reward_category_allowed CHECK (
  category IN ('DRINK', 'SNACK', 'EQUIPMENT', 'TOURNAMENT', 'LESSON')
);
ALTER TABLE "Reward" ADD CONSTRAINT reward_lesson_discount_only CHECK (
  category <> 'LESSON' OR kind <> 'FREE_ITEM'
);
ALTER TABLE "Reward" ADD CONSTRAINT reward_cost_positive CHECK ("costGpr" > 0);
ALTER TABLE "Reward" ADD CONSTRAINT reward_stock_non_negative CHECK (stock IS NULL OR stock >= 0);
ALTER TABLE "Reward" ADD CONSTRAINT reward_discount_value CHECK (
  (kind = 'FREE_ITEM' AND "discountValue" IS NULL)
  OR (kind = 'DISCOUNT_PERCENT' AND "discountValue" BETWEEN 1 AND 100)
  OR (kind = 'DISCOUNT_AMOUNT' AND "discountValue" > 0)
);

-- 4. Rôles : un admin club est rattaché à un club, les autres comptes non.
ALTER TABLE "User" ADD CONSTRAINT user_role_club CHECK (
  (role = 'CLUB_ADMIN' AND "clubId" IS NOT NULL)
  OR (role <> 'CLUB_ADMIN' AND "clubId" IS NULL)
);

-- 5. Coupon : un coupon utilisé a une date d'utilisation et un validateur.
ALTER TABLE "Coupon" ADD CONSTRAINT coupon_used_consistency CHECK (
  (status = 'USED') = ("usedAt" IS NOT NULL AND "validatedById" IS NOT NULL)
);

-- 6. Créneaux cohérents.
ALTER TABLE "Booking" ADD CONSTRAINT booking_time_order CHECK ("endsAt" > "startsAt");
