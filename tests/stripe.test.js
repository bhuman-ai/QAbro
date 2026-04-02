const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createShareCheckoutSession,
  ensureSharePromotionCode
} = require("../lib/stripe");

test("createShareCheckoutSession uses the configured price and promotion code", async () => {
  const recorded = {
    checkoutParams: null
  };
  const fakeClient = {
    promotionCodes: {
      async list(params) {
        assert.equal(params.code, "TEAMREPORT");
        return {
          data: [
            {
              id: "promo_123"
            }
          ]
        };
      }
    },
    checkout: {
      sessions: {
        async create(params) {
          recorded.checkoutParams = params;
          return {
            id: "cs_test_123",
            url: "https://checkout.stripe.com/pay/cs_test_123"
          };
        }
      }
    }
  };

  const created = await createShareCheckoutSession(
    {
      code: "TEAMREPORT",
      shareRunId: "run_share_1",
      email: "owner@example.com",
      origin: "https://swarmtester.com"
    },
    {
      client: fakeClient,
      secretKey: "sk_test_123",
      shareOfferPriceId: "price_123",
      shareOfferMode: "subscription"
    }
  );

  assert.equal(created.ok, true);
  assert.equal(created.id, "cs_test_123");
  assert.equal(created.url, "https://checkout.stripe.com/pay/cs_test_123");
  assert.equal(recorded.checkoutParams.mode, "subscription");
  assert.equal(recorded.checkoutParams.line_items[0].price, "price_123");
  assert.equal(recorded.checkoutParams.discounts[0].promotion_code, "promo_123");
  assert.equal(recorded.checkoutParams.allow_promotion_codes, undefined);
  assert.equal(recorded.checkoutParams.customer_email, "owner@example.com");
  assert.equal(recorded.checkoutParams.client_reference_id, "run_share_1");
});

test("ensureSharePromotionCode creates the coupon and promotion code when missing", async () => {
  const calls = {
    coupon: null,
    promotionCode: null
  };
  const fakeClient = {
    promotionCodes: {
      async list() {
        return { data: [] };
      },
      async create(params) {
        calls.promotionCode = params;
        return {
          id: "promo_live_123"
        };
      }
    },
    coupons: {
      async create(params) {
        calls.coupon = params;
        return {
          id: "coupon_live_123"
        };
      }
    }
  };

  const result = await ensureSharePromotionCode({
    client: fakeClient,
    secretKey: "sk_test_123",
    sharePromoCode: "TEAMREPORT",
    sharePromoPercentOff: 100,
    sharePromoDuration: "once"
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  assert.equal(result.code, "TEAMREPORT");
  assert.equal(result.couponId, "coupon_live_123");
  assert.equal(result.promotionCodeId, "promo_live_123");
  assert.equal(calls.coupon.percent_off, 100);
  assert.equal(calls.coupon.duration, "once");
  assert.equal(calls.promotionCode.code, "TEAMREPORT");
  assert.equal(calls.promotionCode.coupon, "coupon_live_123");
});
