import type { CalculatorResult, Species } from '../lib/calculator';
import { buildPremiumVsClaimsData, buildOutcomeDistribution } from '../lib/calculator';
import naphia from '../data/naphia-baselines.json';
import PremiumVsClaimsChart from './PremiumVsClaimsChart';
import ClaimDistributionChart from './ClaimDistributionChart';
import OutcomeDistributionChart from './OutcomeDistributionChart';

interface Props {
  result: CalculatorResult;
  breed: string;
  species: Species;
  ageNow: number;
  lifeExpectancy: number;
  hasInsurance: boolean;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(n));
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

function PawSVG({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={`inline ${className}`} aria-hidden="true">
      <ellipse cx="7" cy="5.5" rx="2.5" ry="3" />
      <ellipse cx="12" cy="4" rx="2.5" ry="3" />
      <ellipse cx="17" cy="5.5" rx="2.5" ry="3" />
      <ellipse cx="4.5" cy="10" rx="2.5" ry="3" transform="rotate(-15 4.5 10)" />
      <path d="M12 9C8.5 9 6 12 6 15.5C6 18.5 8 21 12 21C16 21 18 18.5 18 15.5C18 12 15.5 9 12 9Z" />
    </svg>
  );
}

export default function Verdict({ result, breed, species, ageNow, lifeExpectancy, hasInsurance }: Props) {
  const { totalPremiums, totalReimbursements, netResult, verdictBranch, isElderly, breedPercentile, yearsOwned } = result;

  const basePremium =
    (species === 'dog' ? naphia.dog.avgAnnualPremium : naphia.cat.avgAnnualPremium) *
    naphia.premiumAdjustmentFactor;

  const chartPoints = buildPremiumVsClaimsData({ species, breed }, lifeExpectancy, basePremium);
  const outcomeData = buildOutcomeDistribution(breed, species, ageBucket(ageNow));

  const isPositive = netResult > 200;
  const isNegative = netResult < -200;
  const isWash     = Math.abs(netResult) <= 200;

  function HeroCard() {
    let bg = '', border = '', textColor = '', headline = '';
    let subEl: React.ReactNode;

    if (isWash) {
      bg = 'bg-amber-50'; border = 'border-amber-200'; textColor = 'text-amber-900';
      headline = "It's essentially a wash.";
      subEl = `Insurance would have broken about even — within ${fmt(netResult)} either way.`;
    } else if (isPositive) {
      bg = 'bg-green-50'; border = 'border-green-200'; textColor = 'text-green-900';
      headline = `Insurance would have saved you ${fmt(netResult)}.`;
      subEl = `Based on your reported vet spending over ${yearsOwned} year${yearsOwned !== 1 ? 's' : ''}, coverage would have returned more than it cost.`;
    } else {
      bg = 'bg-red-50'; border = 'border-red-200'; textColor = 'text-red-900';
      headline = `Insurance would have cost you ${fmt(netResult)} more than your vet bills.`;
      subEl = (
        <>
          For your{' '}
          <PawSVG size={14} className="text-red-700 mx-0.5 align-middle" />
          <strong>{breed}</strong>, premiums over {yearsOwned} year{yearsOwned !== 1 ? 's' : ''} would have exceeded what insurance would have paid back.
        </>
      );
    }

    return (
      <div className={`${bg} ${border} border-2 rounded-2xl p-6 md:p-8`}>
        <p className={`text-2xl md:text-3xl font-bold ${textColor} leading-tight`}>{headline}</p>
        <p className={`mt-2 text-base ${textColor} opacity-80`}>{subEl}</p>
      </div>
    );
  }

  function MathBreakdown() {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">The math</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Estimated total premiums ({yearsOwned} yrs)</span>
            <span className="font-semibold text-gray-900">–{fmt(totalPremiums)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Estimated insurance reimbursements</span>
            <span className="font-semibold text-gray-900">+{fmt(totalReimbursements)}</span>
          </div>
          <div className="border-t border-gray-100 pt-2 flex justify-between">
            <span className="font-medium text-gray-800">Net result</span>
            <span className={`font-bold ${netResult >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {netResult >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(netResult)}
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-400 pt-1">
          Assumes $500 annual deductible, 80% reimbursement rate, $15,000 annual limit, no wellness rider.
        </p>
      </div>
    );
  }

  function BreedComparison() {
    if (!breedPercentile) return null;
    const { userPercentile, n, limitedData, bucket } = breedPercentile;
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Your pet vs. similar pets</h3>
        <p className="text-sm text-gray-700">
          Your reported vet spending puts <strong>{breed}</strong> in approximately the{' '}
          <strong className="text-teal-700">{userPercentile}th percentile</strong> for vet costs
          at age {bucket}.
        </p>
        {limitedData ? (
          <p className="text-xs text-gray-400 mt-2">Based on limited data (n={n} pets at this age range)</p>
        ) : (
          <p className="text-xs text-gray-400 mt-2">Based on {n.toLocaleString()} {breed}s in our dataset</p>
        )}
      </div>
    );
  }

  function BranchContent() {
    const petName = breed || (species === 'dog' ? 'your dog' : 'your cat');

    if (verdictBranch === 'insured-retro') {
      return (
        <div className="prose prose-sm max-w-none text-gray-700">
          <p>
            You have insurance. Here's what the math says about your decision. The numbers above reflect
            what insurance would have paid back vs. what it would have cost in premiums — based on your
            reported spending and a standard policy structure.
          </p>
          {isPositive && (
            <p>
              The math favors your choice. High-cost incidents — surgery, chronic conditions, emergencies —
              are exactly what insurance is designed for, and it appears to have delivered value for{' '}
              {petName}.
            </p>
          )}
          {isNegative && (
            <p>
              The math doesn't favor insurance for this period — but that's not unusual. Most policyholders
              pay more in premiums than they receive back. The value of insurance is in the catastrophic
              scenario, not the average one.
            </p>
          )}
        </div>
      );
    }

    if (verdictBranch === 'young-uninsured') {
      return (
        <div className="prose prose-sm max-w-none text-gray-700">
          <p>
            <strong>{petName}</strong> is still young. The retrospective math above shows what insurance
            would have cost vs. paid during the years you've owned them.
          </p>
          <p>
            The window to lock in a lower premium is now. Most {species === 'dog' ? 'dogs' : 'cats'} see
            the highest claim frequency between ages 7–10, and premiums increase significantly with age.
            Pre-existing conditions won't be covered if you wait — and they don't need to be serious to
            qualify as pre-existing.
          </p>
        </div>
      );
    }

    if (verdictBranch === 'older-uninsured') {
      return (
        <div className="prose prose-sm max-w-none text-gray-700">
          <p>
            <strong>{petName}</strong> is {ageNow} years old. At this age, premiums are significantly
            higher, and some carriers impose coverage limits or exclusions for older pets.
          </p>
          <p>
            The math on new coverage is harder to justify at this stage unless your breed has known
            late-onset conditions (like certain cancers or degenerative joint disease) and you're
            willing to pay elevated premiums for that protection.
          </p>
        </div>
      );
    }

    return (
      <div className="prose prose-sm max-w-none text-gray-700">
        <p>
          The numbers came out close. At a margin this small, insurance would have been roughly
          break-even for {petName} — neither a clear win nor a clear loss.
        </p>
        <p>
          At that margin, the real question is peace of mind. If a $5,000 emergency bill would cause
          financial stress, insurance is a reasonable hedge even when the expected value is neutral.
          If you can absorb that kind of expense, self-insuring is defensible.
        </p>
      </div>
    );
  }

  function ElderlyOverlay() {
    if (!isElderly) return null;
    return (
      <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-xl px-5 py-4 space-y-2">
        <h3 className="font-semibold text-amber-900">A note on {breed}'s age</h3>
        <p className="text-sm text-amber-800">
          Your {breed} is {ageNow} years old, beyond the typical lifespan for the breed. Two things to know:
        </p>
        <ul className="text-sm text-amber-800 list-disc list-inside space-y-1">
          <li>
            Our reference data thins out at this age. Treat the percentile comparisons as directional,
            not precise.
          </li>
          <li>
            Most carriers won't issue a new policy on a pet this age, and existing policies often see
            steep premium increases. The retrospective math above is reliable; forward-looking guidance
            doesn't apply here.
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <HeroCard />
      <MathBreakdown />
      <ElderlyOverlay />
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">What this means for you</h3>
        <BranchContent />
      </div>
      <BreedComparison />

      {/* Charts — collapsible */}
      <details open className="group">
        <summary className="flex items-center justify-between cursor-pointer py-2 list-none select-none">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Detailed breed data</p>
          <svg className="w-4 h-4 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="space-y-6 pt-4">
          <PremiumVsClaimsChart data={chartPoints} ageNow={ageNow} />
          {breedPercentile && (
            <ClaimDistributionChart
              percentileData={breedPercentile}
              breed={breed}
              userAnnualSpend={Math.round(result.claimableSpend / result.yearsOwned)}
            />
          )}
          {outcomeData.length > 0 && (
            <OutcomeDistributionChart data={outcomeData} breed={breed} />
          )}
        </div>
      </details>
    </div>
  );
}
