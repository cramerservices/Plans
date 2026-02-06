export type MiniSplitHeadTier = {
  heads: number;
  amount: number;
  stripePriceId: string;
};

export const MINI_SPLIT_HEAD_TIERS: MiniSplitHeadTier[] = [
  { heads: 4, amount: 340, stripePriceId: 'price_1Sx7Hb4IltCwxOnNaFhEgNOR' },
  { heads: 5, amount: 400, stripePriceId: 'price_1Sx7Hq4IltCwxOnNY8mtIhbM' },
  { heads: 6, amount: 450, stripePriceId: 'price_1SxZIY4IltCwxOnNCryF0YRo' },
  { heads: 7, amount: 475, stripePriceId: 'price_1SxZIn4IltCwxOnNwDOM6KJM' },
  { heads: 8, amount: 500, stripePriceId: 'price_1SxZJ14IltCwxOnNvXSBPiXr' },
  { heads: 9, amount: 525, stripePriceId: 'price_1SxZJD4IltCwxOnNL1ViF8YA' },
];

export const getMiniSplitTier = (heads: number) =>
  MINI_SPLIT_HEAD_TIERS.find((tier) => tier.heads === heads);

export const isMiniSplitPlan = (planName?: string | null) =>
  (planName ?? '').toLowerCase().includes('mini split');
