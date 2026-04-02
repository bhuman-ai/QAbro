#!/usr/bin/env node

const { ensureSharePromotionCode } = require("../lib/stripe");

async function main() {
  const result = await ensureSharePromotionCode();
  if (!result.ok) {
    throw new Error(result.error || "Could not bootstrap Stripe share offer");
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        created: result.created,
        code: result.code,
        coupon_id: result.couponId,
        promotion_code_id: result.promotionCodeId
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`${error?.message || "Stripe share offer bootstrap failed"}\n`);
  process.exit(1);
});
