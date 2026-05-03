import naphia from '../data/naphia-baselines.json';
import policyDefaults from '../data/policy-defaults.json';
import breedEconomics from '../data/breed-economics.json';

export type Species = 'dog' | 'cat';

export type SpendingBucket =
  | 'under500'
  | '500to1500'
  | '1500to5000'
  | '5000to15000'
  | 'over15000';

export type IncidentDog =
  | 'surgery'
  | 'cancer'
  | 'emergency'
  | 'chronic'
  | 'hipJoint'
  | 'dental'
  | 'bloat'
  | 'none';

export type IncidentCat =
  | 'surgery'
  | 'cancer'
  | 'urinary'
  | 'chronic'
  | 'emergency'
  | 'dental'
  | 'none';

export interface CalculatorInput {
  species: Species;
  breed: string;
  ageNow: number;
  ageAcquired: number;
  spendingBucket: SpendingBucket;
  routinePercent: number;
  largestBill:
    | 'under300'
    | '300to1000'
    | '1000to3000'
    | '3000to5000'
    | 'over5000';
  incidents: string[];
  hasInsurance: boolean;
  wouldBuyAgain?: 'yes' | 'no' | 'unsure';
}

export interface BreedPercentileData {
  n: number;
  mean: number;
  median: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  p95?: number;
  limitedData?: boolean;
  userPercentile: number;
  bucket: string;
}

export interface YearDetail {
  year: number;
  age: number;
  premium: number;
  claimable: number;
  afterDeductible: number;
  reimbursement: number;
}

export type VerdictBranch =
  | 'insured-retro'
  | 'young-uninsured'
  | 'older-uninsured'
  | 'wash';

export interface CalculatorResult {
  totalPremiums: number;
  totalReimbursements: number;
  netResult: number;
  verdictBranch: VerdictBranch;
  isElderly: boolean;
  breedPercentile: BreedPercentileData | null;
  yearsOwned: number;
  annualPremiumEstimate: number;
  yearDetails: YearDetail[];
  totalVetSpend: number;
  claimableSpend: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BUCKET_MIDPOINTS: Record<SpendingBucket, number> = {
  under500:      250,
  '500to1500':   1000,
  '1500to5000':  3250,
  '5000to15000': 10000,
  over15000:     20000,
};

// Age-banded premium multipliers (relative to base NAPHIA average)
function agePremiumMultiplier(age: number): number {
  if (age <= 1)  return 0.85;
  if (age <= 3)  return 0.95;
  if (age <= 5)  return 1.05;
  if (age <= 7)  return 1.20;
  if (age <= 9)  return 1.40;
  if (age <= 11) return 1.60;
  return 1.80;
}

function ageBucket(age: number): string {
  const y = Math.floor(age);
  if (y <= 1)  return '0-1';
  if (y <= 3)  return '2-3';
  if (y <= 5)  return '4-5';
  if (y <= 7)  return '6-7';
  if (y <= 9)  return '8-9';
  if (y <= 11) return '10-11';
  return '12+';
}

function getBreedEconomics(breed: string, species: Species) {
  const eco = breedEconomics as Record<string, Record<string, { n: number; mean: number; median: number; p25?: number; p50?: number; p75?: number; p90?: number; p95?: number; limitedData?: boolean }>>;
  if (eco[breed]) return eco[breed];
  const fallback = species === 'dog' ? '_dog_average' : '_cat_average';
  return eco[fallback] ?? null;
}

function estimateUserPercentile(userAnnualSpend: number, bucketData: { n: number; mean: number; median: number; p25?: number; p50?: number; p75?: number; p90?: number; p95?: number }): number {
  if (userAnnualSpend <= 0) return 10;
  const { p25 = 0, p50 = bucketData.median, p75 = bucketData.mean, p90 = bucketData.mean * 1.5, p95 = bucketData.mean * 2 } = bucketData;
  if (userAnnualSpend <= p25) return 20;
  if (userAnnualSpend <= p50) return 45;
  if (userAnnualSpend <= p75) return 65;
  if (userAnnualSpend <= p90) return 82;
  if (userAnnualSpend <= p95) return 92;
  return 97;
}

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------
export function calculate(input: CalculatorInput): CalculatorResult {
  const {
    species,
    breed,
    ageNow,
    ageAcquired,
    spendingBucket,
    routinePercent,
    hasInsurance,
  } = input;

  const yearsOwned = Math.max(1, ageNow - ageAcquired);
  const basePremium =
    (species === 'dog' ? naphia.dog.avgAnnualPremium : naphia.cat.avgAnnualPremium) *
    naphia.premiumAdjustmentFactor;

  const totalVetSpend = BUCKET_MIDPOINTS[spendingBucket];
  const routineSpend = totalVetSpend * (routinePercent / 100);
  const claimableSpend = totalVetSpend - routineSpend;
  const annualClaimable = claimableSpend / yearsOwned;

  const yearDetails: YearDetail[] = [];
  let totalPremiums = 0;
  let totalReimbursements = 0;

  for (let i = 0; i < yearsOwned; i++) {
    const age = ageAcquired + i + 0.5; // midpoint of year
    const multiplier = agePremiumMultiplier(age);
    const premium = basePremium * multiplier;

    const afterDeductible = Math.max(0, annualClaimable - policyDefaults.annualDeductible);
    const reimbursement = Math.min(
      afterDeductible * policyDefaults.reimbursementRate,
      policyDefaults.annualLimit,
    );

    yearDetails.push({
      year: i + 1,
      age: Math.round(age),
      premium: Math.round(premium),
      claimable: Math.round(annualClaimable),
      afterDeductible: Math.round(afterDeductible),
      reimbursement: Math.round(reimbursement),
    });

    totalPremiums += premium;
    totalReimbursements += reimbursement;
  }

  totalPremiums = Math.round(totalPremiums);
  totalReimbursements = Math.round(totalReimbursements);
  const netResult = totalReimbursements - totalPremiums;

  // Verdict branch
  const isElderly =
    (species === 'dog' && ageNow >= policyDefaults.elderlyThresholds.dog) ||
    (species === 'cat' && ageNow >= policyDefaults.elderlyThresholds.cat);

  let verdictBranch: VerdictBranch;
  if (hasInsurance) {
    verdictBranch = 'insured-retro';
  } else if (Math.abs(netResult) < 200) {
    verdictBranch = 'wash';
  } else if (ageNow < 5) {
    verdictBranch = 'young-uninsured';
  } else if (ageNow >= 7) {
    verdictBranch = 'older-uninsured';
  } else {
    verdictBranch = netResult >= 0 ? 'young-uninsured' : 'older-uninsured';
  }

  // Breed percentile
  let breedPercentile: BreedPercentileData | null = null;
  const ecoData = getBreedEconomics(breed, species);
  if (ecoData) {
    const bucket = ageBucket(ageNow);
    const bucketData = ecoData[bucket];
    if (bucketData) {
      const userAnnualSpend = annualClaimable;
      const pctile = estimateUserPercentile(userAnnualSpend, bucketData);
      breedPercentile = {
        ...bucketData,
        userPercentile: pctile,
        bucket,
      };
    }
  }

  const annualPremiumEstimate = Math.round(basePremium * agePremiumMultiplier(ageNow));

  return {
    totalPremiums,
    totalReimbursements,
    netResult,
    verdictBranch,
    isElderly,
    breedPercentile,
    yearsOwned,
    annualPremiumEstimate,
    yearDetails,
    totalVetSpend,
    claimableSpend,
  };
}

// ---------------------------------------------------------------------------
// Chart data helpers
// ---------------------------------------------------------------------------
export interface ChartYearPoint {
  age: number;
  premium: number;
  avgClaims: number | null;
  isExtrapolated?: boolean;
}

export function buildPremiumVsClaimsData(
  input: Pick<CalculatorInput, 'species' | 'breed'>,
  lifeExpectancy: number,
  basePremium: number,
): ChartYearPoint[] {
  const ecoData = getBreedEconomics(input.breed, input.species);
  const points: ChartYearPoint[] = [];

  for (let age = 0; age <= lifeExpectancy + 2; age++) {
    const premium = Math.round(basePremium * agePremiumMultiplier(age));
    const bucket = ageBucket(age);
    const bucketData = ecoData?.[bucket];
    const avgClaims = bucketData ? bucketData.median : null;
    const isExtrapolated = age > lifeExpectancy;
    points.push({ age, premium, avgClaims, isExtrapolated });
  }
  return points;
}

export interface OutcomeBucket {
  label: string;
  count: number;
  pct: number;
  color: string;
}

export function buildOutcomeDistribution(
  breed: string,
  species: Species,
  ageBucketKey: string,
): OutcomeBucket[] {
  const ecoData = getBreedEconomics(breed, species);
  const bd = ecoData?.[ageBucketKey];
  if (!bd || !bd.n) return [];

  const { n, p25 = 0, p50 = bd.median, p75 = bd.mean, p90 = bd.mean * 1.5 } = bd as { n: number; mean: number; median: number; p25?: number; p50?: number; p75?: number; p90?: number; p95?: number };

  // Estimate category counts from percentiles
  const zeroPct = p25 === 0 ? 35 : 20;
  const lowPct = 30;
  const midPct = 25;
  const highPct = 100 - zeroPct - lowPct - midPct;

  return [
    { label: 'No claims filed', count: Math.round(n * zeroPct / 100), pct: zeroPct, color: '#6B7280' },
    { label: 'Under $1,000', count: Math.round(n * lowPct / 100), pct: lowPct, color: '#1B6B6D' },
    { label: '$1,000–$5,000', count: Math.round(n * midPct / 100), pct: midPct, color: '#D4943A' },
    { label: 'Over $5,000', count: Math.round(n * highPct / 100), pct: highPct, color: '#991B1B' },
  ];
}
