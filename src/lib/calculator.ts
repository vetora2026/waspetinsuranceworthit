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
  /** null when the bucket has no published percentiles — we never synthesise them. */
  userPercentile: number | null;
  /** true when the breed bucket was under MIN_BUCKET_N and we fell back to the species average. */
  usedSpeciesAverage: boolean;
  bucket: string;
}

export interface YearDetail {
  year: number;
  age: number;
  premium: number;
  claimable: number;
  afterDeductible: number;
  reimbursement: number;
  isClaimYear: boolean;
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
  claimYears: number;
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

const BILL_MIDPOINTS: Record<CalculatorInput['largestBill'], number> = {
  under300:     150,
  '300to1000':  650,
  '1000to3000': 2000,
  '3000to5000': 4000,
  over5000:     7500,
};

/** Breed/age buckets thinner than this fall back to the species-wide average. */
const MIN_BUCKET_N = 30;

// Age-banded premium multipliers, relative to the NAPHIA national average.
// Bands live in policy-defaults.json — they are a site assumption, not a NAPHIA figure.
function agePremiumMultiplier(age: number): number {
  const bands = policyDefaults.agePremiumMultipliers.bands;
  for (const band of bands) {
    if (age <= band.maxAge) return band.multiplier;
  }
  return bands[bands.length - 1].multiplier;
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

type EconomicsBucket = {
  n: number;
  mean: number;
  median: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p90?: number;
  p95?: number;
  limitedData?: boolean;
};

function speciesAverageEconomics(species: Species): Record<string, EconomicsBucket> | null {
  const eco = breedEconomics as Record<string, Record<string, EconomicsBucket>>;
  return eco[species === 'dog' ? '_dog_average' : '_cat_average'] ?? null;
}

function getBreedEconomics(breed: string, species: Species) {
  const eco = breedEconomics as Record<string, Record<string, EconomicsBucket>>;
  if (eco[breed]) return eco[breed];
  return speciesAverageEconomics(species);
}

/**
 * Where the user's claimable spend sits against the published percentiles for this
 * breed and age. Returns null when the bucket has no percentiles — we do not
 * synthesise them from the mean.
 */
function estimateUserPercentile(userAnnualSpend: number, bucketData: EconomicsBucket): number | null {
  const { p25, p50, p75, p90, p95 } = bucketData;
  if (p25 === undefined || p50 === undefined || p75 === undefined || p90 === undefined || p95 === undefined) {
    return null;
  }
  if (userAnnualSpend <= 0) return 10;
  if (userAnnualSpend <= p25) return 20;
  if (userAnnualSpend <= p50) return 45;
  if (userAnnualSpend <= p75) return 65;
  if (userAnnualSpend <= p90) return 82;
  if (userAnnualSpend <= p95) return 92;
  return 97;
}

/**
 * Split claimable spend across the years the owner actually reported an incident.
 * If the largest single bill exceeds an even split, it takes one claim year on its
 * own and the remainder spreads across the others.
 */
function claimYearAmounts(
  claimableSpend: number,
  claimYears: number,
  largestBill: CalculatorInput['largestBill'],
): number[] {
  const even = claimableSpend / claimYears;
  const largest = BILL_MIDPOINTS[largestBill] ?? 0;
  if (claimYears < 2 || largest <= even) return Array(claimYears).fill(even);
  const capped = Math.min(largest, claimableSpend);
  const rest = Math.max(0, (claimableSpend - capped) / (claimYears - 1));
  return [capped, ...Array(claimYears - 1).fill(rest)];
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
    largestBill,
    incidents,
    hasInsurance,
  } = input;

  const yearsOwned = Math.max(1, ageNow - ageAcquired);
  const basePremium =
    species === 'dog' ? naphia.dog.avgAnnualPremium : naphia.cat.avgAnnualPremium;

  const totalVetSpend = BUCKET_MIDPOINTS[spendingBucket];
  const routineSpend = totalVetSpend * (routinePercent / 100);
  const claimableSpend = totalVetSpend - routineSpend;

  // The deductible is annual, so it applies once per year in which a claim was made —
  // not once per year owned. Use the incidents the owner actually reported.
  const incidentCount = incidents.filter((i) => i !== 'none').length;
  const claimYears = Math.min(Math.max(1, incidentCount), Math.floor(yearsOwned) || 1);
  const amounts = claimYearAmounts(claimableSpend, claimYears, largestBill);

  // Claim years are placed at the end of the ownership period (claims skew later in life).
  const yearCount = Math.max(1, Math.round(yearsOwned));
  const firstClaimYear = yearCount - claimYears;

  const yearDetails: YearDetail[] = [];
  let totalPremiums = 0;
  let totalReimbursements = 0;

  for (let i = 0; i < yearCount; i++) {
    const age = ageAcquired + i + 0.5; // midpoint of year
    const premium = basePremium * agePremiumMultiplier(age);

    const isClaimYear = i >= firstClaimYear;
    const claimable = isClaimYear ? amounts[i - firstClaimYear] : 0;
    const afterDeductible = isClaimYear
      ? Math.max(0, claimable - policyDefaults.annualDeductible)
      : 0;
    const reimbursement = Math.min(
      afterDeductible * policyDefaults.reimbursementRate,
      policyDefaults.annualLimit,
    );

    yearDetails.push({
      year: i + 1,
      age: Math.round(age),
      premium: Math.round(premium),
      claimable: Math.round(claimable),
      afterDeductible: Math.round(afterDeductible),
      reimbursement: Math.round(reimbursement),
      isClaimYear,
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

  // Breed percentile — pattern comparison only, never a dollar projection.
  let breedPercentile: BreedPercentileData | null = null;
  const ecoData = getBreedEconomics(breed, species);
  const bucket = ageBucket(ageNow);
  let bucketData = ecoData?.[bucket];
  let usedSpeciesAverage = false;
  if (bucketData && bucketData.n < MIN_BUCKET_N) {
    const avg = speciesAverageEconomics(species)?.[bucket];
    if (avg && avg.n >= MIN_BUCKET_N) {
      bucketData = avg;
      usedSpeciesAverage = true;
    }
  }
  if (bucketData) {
    breedPercentile = {
      ...bucketData,
      userPercentile: estimateUserPercentile(claimableSpend / yearsOwned, bucketData),
      usedSpeciesAverage,
      bucket,
    };
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
    claimYears,
  };
}
