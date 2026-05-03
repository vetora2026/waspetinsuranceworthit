"""
Generates breeds.json and breed-economics.json from stevenrhart/predicting-claims dataset.
Columns confirmed:
  PetData:   PetId, EnrollDate, Species, Breed, PetAge (text), Premium, Deductible, EnrollPath
  ClaimData: PetId, ClaimId, ClaimDate, AmountClaimed
"""

import csv, json, re, statistics, os
from collections import defaultdict

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'data')
PET_PATH  = "/tmp/PetData.csv"
CLAIM_PATH = "/tmp/ClaimData.csv"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def parse_age_years(text):
    """Convert PetAge text strings to a float in years."""
    t = (text or '').lower().strip()
    # "8 weeks to 12 months old" → 0.5
    if 'week' in t:
        m = re.search(r'(\d+)\s*week', t)
        return float(m.group(1)) / 52 if m else 0.25
    # "12 months old" → 1.0
    if 'month' in t and 'year' not in t:
        m = re.search(r'(\d+)', t)
        return float(m.group(1)) / 12 if m else 0.5
    # "3 years old"
    m = re.search(r'(\d+)\s*year', t)
    if m:
        return float(m.group(1))
    # bare number
    m = re.search(r'(\d+)', t)
    return float(m.group(1)) if m else 0.0

def clean_breed(raw):
    """Normalize breed names from the dataset."""
    b = (raw or '').strip()
    # Remove parenthetical size descriptors
    b = re.sub(r'\s*\(.*?\)', '', b)
    # Normalise dash patterns: "Schnauzer - Standard" → "Standard Schnauzer"
    parts = [p.strip() for p in b.split(' - ')]
    if len(parts) == 2:
        b = f"{parts[1]} {parts[0]}"
    b = b.strip().title()
    # Collapse mixed breed labels
    if re.search(r'mixed\s*breed', b, re.I) or b.lower() in ('mixed', 'mix'):
        species_hint = ''  # filled after
        return 'Mixed Breed'
    return b

def age_bucket(years):
    y = int(years)
    if y <= 1:  return '0-1'
    if y <= 3:  return '2-3'
    if y <= 5:  return '4-5'
    if y <= 7:  return '6-7'
    if y <= 9:  return '8-9'
    if y <= 11: return '10-11'
    return '12+'

# ---------------------------------------------------------------------------
# Step 1 — Load PetData
# ---------------------------------------------------------------------------
pets = {}  # pid -> {species, breed, age_years}
with open(PET_PATH, newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        pid     = row['PetId'].strip()
        species = row['Species'].strip().title()
        breed   = clean_breed(row['Breed'])
        age_yr  = parse_age_years(row['PetAge'])
        if pid and species and breed:
            pets[pid] = {'species': species, 'breed': breed, 'age_years': age_yr}

print(f"Loaded {len(pets)} pets")

# Quick sanity sample
sample = list(pets.items())[:5]
for pid, p in sample:
    print(f"  PetId={pid} {p['species']} '{p['breed']}' age={p['age_years']:.1f}y")

# ---------------------------------------------------------------------------
# Step 2 — Load ClaimData (sum per pet)
# ---------------------------------------------------------------------------
pet_claims = defaultdict(float)  # pid -> total lifetime claims
claim_rows = 0
with open(CLAIM_PATH, newline='', encoding='utf-8-sig') as f:
    for row in csv.DictReader(f):
        pid = row['PetId'].strip()
        try:
            amt = float(row['AmountClaimed'] or 0)
        except ValueError:
            amt = 0.0
        if pid and amt > 0:
            pet_claims[pid] += amt
            claim_rows += 1

print(f"Loaded {claim_rows} claim rows covering {len(pet_claims)} pets with non-zero claims")
total_claimed = sum(pet_claims.values())
print(f"Total amount claimed: ${total_claimed:,.0f}")

# ---------------------------------------------------------------------------
# Step 3 — Aggregate by (species, breed, age bucket)
# ---------------------------------------------------------------------------
# breed_data[breed][bucket] = list of claim totals
breed_data  = defaultdict(lambda: defaultdict(list))
species_data = defaultdict(lambda: defaultdict(list))  # fallback by species

for pid, pet in pets.items():
    species = pet['species']
    breed   = pet['breed']
    bucket  = age_bucket(pet['age_years'])
    claim   = pet_claims.get(pid, 0.0)
    breed_data[breed][bucket].append(claim)
    species_data[species][bucket].append(claim)

# ---------------------------------------------------------------------------
# Step 4 — Compute statistics
# ---------------------------------------------------------------------------
def compute_stats(values):
    n = len(values)
    if n < 5:
        return None
    s = sorted(values)
    mean = round(sum(s) / n)
    med  = round(statistics.median(s))
    def pct(p):
        idx = min(int(n * p / 100), n - 1)
        return round(s[idx])
    base = {'n': n, 'mean': mean, 'median': med}
    if n >= 30:
        base.update({'p25': pct(25), 'p50': pct(50),
                     'p75': pct(75), 'p90': pct(90), 'p95': pct(95)})
    else:
        base['limitedData'] = True
    return base

# Species baselines
species_baselines = {}
for sp, buckets in species_data.items():
    species_baselines[sp] = {}
    for bucket, vals in buckets.items():
        s = compute_stats(vals)
        if s:
            species_baselines[sp][bucket] = s

# Breed economics
economics = {}
for breed, buckets in breed_data.items():
    total_n = sum(len(v) for v in buckets.values())
    if total_n < 10:
        continue
    entry = {}
    for bucket, vals in buckets.items():
        if len(vals) < 10:
            continue
        s = compute_stats(vals)
        if s:
            entry[bucket] = s
    if entry:
        economics[breed] = entry

# Add species-level fallbacks
for sp, key in [('Dog', '_dog_average'), ('Cat', '_cat_average')]:
    if sp in species_baselines:
        economics[key] = species_baselines[sp]

print(f"\nbreed-economics.json: {len(economics)} breed entries")

# Sanity check: show a few stats for Labrador
lab_key = None
for k in economics:
    if 'labrador' in k.lower():
        lab_key = k
        break
if lab_key:
    print(f"  Sample — {lab_key}: {economics[lab_key]}")

with open(os.path.join(OUT_DIR, 'breed-economics.json'), 'w') as f:
    json.dump(economics, f, indent=2)
print("Wrote breed-economics.json")

# ---------------------------------------------------------------------------
# Step 5 — Build breed lists
# ---------------------------------------------------------------------------
dog_names_from_data = sorted(
    b for b, buckets in breed_data.items()
    if any(pets[pid]['species'] == 'Dog'
           for pid in pets if pets[pid]['breed'] == b)
       and b and len(b) > 1
)

# AKC reference metadata
BREED_META = {
    "Affenpinscher": {"size": "Small", "lifeExpectancy": 13},
    "Afghan Hound": {"size": "Large", "lifeExpectancy": 13},
    "Airedale Terrier": {"size": "Large", "lifeExpectancy": 13},
    "Akita": {"size": "Large", "lifeExpectancy": 12},
    "Alaskan Malamute": {"size": "Large", "lifeExpectancy": 13},
    "American English Coonhound": {"size": "Large", "lifeExpectancy": 12},
    "American Eskimo Dog": {"size": "Medium", "lifeExpectancy": 14},
    "American Foxhound": {"size": "Large", "lifeExpectancy": 12},
    "American Staffordshire Terrier": {"size": "Medium", "lifeExpectancy": 13},
    "American Water Spaniel": {"size": "Medium", "lifeExpectancy": 13},
    "Anatolian Shepherd Dog": {"size": "Giant", "lifeExpectancy": 13},
    "Australian Cattle Dog": {"size": "Medium", "lifeExpectancy": 13},
    "Australian Shepherd": {"size": "Medium", "lifeExpectancy": 13},
    "Australian Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Basenji": {"size": "Small", "lifeExpectancy": 14},
    "Basset Hound": {"size": "Medium", "lifeExpectancy": 12},
    "Beagle": {"size": "Small", "lifeExpectancy": 14},
    "Bearded Collie": {"size": "Large", "lifeExpectancy": 14},
    "Bedlington Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Belgian Malinois": {"size": "Large", "lifeExpectancy": 13},
    "Belgian Sheepdog": {"size": "Large", "lifeExpectancy": 13},
    "Belgian Tervuren": {"size": "Large", "lifeExpectancy": 13},
    "Bergamasco Sheepdog": {"size": "Large", "lifeExpectancy": 13},
    "Bernese Mountain Dog": {"size": "Giant", "lifeExpectancy": 9},
    "Bichon Frise": {"size": "Small", "lifeExpectancy": 14},
    "Black And Tan Coonhound": {"size": "Large", "lifeExpectancy": 12},
    "Bloodhound": {"size": "Large", "lifeExpectancy": 10},
    "Bluetick Coonhound": {"size": "Large", "lifeExpectancy": 12},
    "Border Collie": {"size": "Medium", "lifeExpectancy": 13},
    "Border Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Borzoi": {"size": "Large", "lifeExpectancy": 12},
    "Boston Terrier": {"size": "Small", "lifeExpectancy": 13},
    "Bouvier Des Flandres": {"size": "Large", "lifeExpectancy": 12},
    "Boxer": {"size": "Large", "lifeExpectancy": 11},
    "Boykin Spaniel": {"size": "Medium", "lifeExpectancy": 14},
    "Briard": {"size": "Large", "lifeExpectancy": 13},
    "Brittany": {"size": "Medium", "lifeExpectancy": 13},
    "Brussels Griffon": {"size": "Small", "lifeExpectancy": 13},
    "Bull Terrier": {"size": "Medium", "lifeExpectancy": 13},
    "Bulldog": {"size": "Medium", "lifeExpectancy": 10},
    "Bullmastiff": {"size": "Giant", "lifeExpectancy": 10},
    "Cairn Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Canaan Dog": {"size": "Medium", "lifeExpectancy": 14},
    "Cane Corso": {"size": "Giant", "lifeExpectancy": 10},
    "Cardigan Welsh Corgi": {"size": "Medium", "lifeExpectancy": 13},
    "Cavalier King Charles Spaniel": {"size": "Small", "lifeExpectancy": 12},
    "Chesapeake Bay Retriever": {"size": "Large", "lifeExpectancy": 12},
    "Chihuahua": {"size": "Small", "lifeExpectancy": 15},
    "Chinese Crested": {"size": "Small", "lifeExpectancy": 14},
    "Chinese Shar-Pei": {"size": "Large", "lifeExpectancy": 11},
    "Chow Chow": {"size": "Large", "lifeExpectancy": 12},
    "Clumber Spaniel": {"size": "Large", "lifeExpectancy": 12},
    "Cocker Spaniel": {"size": "Medium", "lifeExpectancy": 13},
    "Collie": {"size": "Large", "lifeExpectancy": 13},
    "Coton De Tulear": {"size": "Small", "lifeExpectancy": 14},
    "Dachshund": {"size": "Small", "lifeExpectancy": 14},
    "Dalmatian": {"size": "Large", "lifeExpectancy": 13},
    "Doberman Pinscher": {"size": "Large", "lifeExpectancy": 11},
    "Dogue De Bordeaux": {"size": "Giant", "lifeExpectancy": 8},
    "English Bulldog": {"size": "Medium", "lifeExpectancy": 10},
    "English Foxhound": {"size": "Large", "lifeExpectancy": 12},
    "English Setter": {"size": "Large", "lifeExpectancy": 12},
    "English Springer Spaniel": {"size": "Medium", "lifeExpectancy": 13},
    "Field Spaniel": {"size": "Medium", "lifeExpectancy": 13},
    "Finnish Spitz": {"size": "Medium", "lifeExpectancy": 13},
    "Flat-Coated Retriever": {"size": "Large", "lifeExpectancy": 11},
    "French Bulldog": {"size": "Small", "lifeExpectancy": 11},
    "German Shepherd": {"size": "Large", "lifeExpectancy": 11},
    "German Shepherd Dog": {"size": "Large", "lifeExpectancy": 11},
    "German Shorthaired Pointer": {"size": "Large", "lifeExpectancy": 12},
    "Giant Schnauzer": {"size": "Large", "lifeExpectancy": 12},
    "Golden Retriever": {"size": "Large", "lifeExpectancy": 12},
    "Goldendoodle": {"size": "Large", "lifeExpectancy": 13},
    "Gordon Setter": {"size": "Large", "lifeExpectancy": 12},
    "Great Dane": {"size": "Giant", "lifeExpectancy": 9},
    "Great Pyrenees": {"size": "Giant", "lifeExpectancy": 12},
    "Greater Swiss Mountain Dog": {"size": "Giant", "lifeExpectancy": 11},
    "Greyhound": {"size": "Large", "lifeExpectancy": 13},
    "Harrier": {"size": "Medium", "lifeExpectancy": 13},
    "Havanese": {"size": "Small", "lifeExpectancy": 14},
    "Ibizan Hound": {"size": "Medium", "lifeExpectancy": 13},
    "Irish Red And White Setter": {"size": "Large", "lifeExpectancy": 13},
    "Irish Setter": {"size": "Large", "lifeExpectancy": 12},
    "Irish Terrier": {"size": "Small", "lifeExpectancy": 13},
    "Irish Water Spaniel": {"size": "Large", "lifeExpectancy": 13},
    "Irish Wolfhound": {"size": "Giant", "lifeExpectancy": 8},
    "Italian Greyhound": {"size": "Small", "lifeExpectancy": 14},
    "Jack Russell Terrier": {"size": "Small", "lifeExpectancy": 16},
    "Japanese Chin": {"size": "Small", "lifeExpectancy": 13},
    "Keeshond": {"size": "Medium", "lifeExpectancy": 13},
    "Kerry Blue Terrier": {"size": "Medium", "lifeExpectancy": 13},
    "Komondor": {"size": "Giant", "lifeExpectancy": 12},
    "Kuvasz": {"size": "Giant", "lifeExpectancy": 12},
    "Labradoodle": {"size": "Large", "lifeExpectancy": 13},
    "Labrador Retriever": {"size": "Large", "lifeExpectancy": 12},
    "Lakeland Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Leonberger": {"size": "Giant", "lifeExpectancy": 10},
    "Lhasa Apso": {"size": "Small", "lifeExpectancy": 14},
    "Lowchen": {"size": "Small", "lifeExpectancy": 14},
    "Maltese": {"size": "Small", "lifeExpectancy": 14},
    "Manchester Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Mastiff": {"size": "Giant", "lifeExpectancy": 9},
    "Miniature American Shepherd": {"size": "Small", "lifeExpectancy": 13},
    "Miniature Bull Terrier": {"size": "Small", "lifeExpectancy": 13},
    "Miniature Pinscher": {"size": "Small", "lifeExpectancy": 14},
    "Miniature Poodle": {"size": "Small", "lifeExpectancy": 14},
    "Miniature Schnauzer": {"size": "Small", "lifeExpectancy": 14},
    "Mixed Breed": {"size": "Medium", "lifeExpectancy": 13},
    "Newfoundland": {"size": "Giant", "lifeExpectancy": 10},
    "Norfolk Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Norwegian Elkhound": {"size": "Medium", "lifeExpectancy": 13},
    "Norwich Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Nova Scotia Duck Tolling Retriever": {"size": "Medium", "lifeExpectancy": 13},
    "Old English Sheepdog": {"size": "Large", "lifeExpectancy": 12},
    "Otterhound": {"size": "Large", "lifeExpectancy": 12},
    "Papillon": {"size": "Small", "lifeExpectancy": 14},
    "Parson Russell Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Pekingese": {"size": "Small", "lifeExpectancy": 13},
    "Pembroke Welsh Corgi": {"size": "Small", "lifeExpectancy": 13},
    "Petit Basset Griffon Vendeen": {"size": "Small", "lifeExpectancy": 14},
    "Pharaoh Hound": {"size": "Medium", "lifeExpectancy": 13},
    "Plott": {"size": "Medium", "lifeExpectancy": 13},
    "Pointer": {"size": "Large", "lifeExpectancy": 13},
    "Pomeranian": {"size": "Small", "lifeExpectancy": 14},
    "Poodle": {"size": "Large", "lifeExpectancy": 14},
    "Portuguese Water Dog": {"size": "Medium", "lifeExpectancy": 13},
    "Pug": {"size": "Small", "lifeExpectancy": 13},
    "Redbone Coonhound": {"size": "Large", "lifeExpectancy": 12},
    "Rhodesian Ridgeback": {"size": "Large", "lifeExpectancy": 12},
    "Rottweiler": {"size": "Large", "lifeExpectancy": 10},
    "Saint Bernard": {"size": "Giant", "lifeExpectancy": 10},
    "Saluki": {"size": "Large", "lifeExpectancy": 13},
    "Samoyed": {"size": "Large", "lifeExpectancy": 13},
    "Schipperke": {"size": "Small", "lifeExpectancy": 14},
    "Scottish Deerhound": {"size": "Giant", "lifeExpectancy": 10},
    "Scottish Terrier": {"size": "Small", "lifeExpectancy": 13},
    "Sealyham Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Shetland Sheepdog": {"size": "Small", "lifeExpectancy": 13},
    "Shiba Inu": {"size": "Small", "lifeExpectancy": 14},
    "Shih Tzu": {"size": "Small", "lifeExpectancy": 14},
    "Siberian Husky": {"size": "Medium", "lifeExpectancy": 13},
    "Silky Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Skye Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Smooth Fox Terrier": {"size": "Small", "lifeExpectancy": 13},
    "Soft Coated Wheaten Terrier": {"size": "Medium", "lifeExpectancy": 14},
    "Spinone Italiano": {"size": "Large", "lifeExpectancy": 12},
    "Staffordshire Bull Terrier": {"size": "Medium", "lifeExpectancy": 13},
    "Standard Poodle": {"size": "Large", "lifeExpectancy": 14},
    "Standard Schnauzer": {"size": "Medium", "lifeExpectancy": 13},
    "Sussex Spaniel": {"size": "Medium", "lifeExpectancy": 13},
    "Tibetan Mastiff": {"size": "Giant", "lifeExpectancy": 12},
    "Tibetan Spaniel": {"size": "Small", "lifeExpectancy": 14},
    "Tibetan Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Toy Manchester Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Toy Poodle": {"size": "Small", "lifeExpectancy": 14},
    "Treeing Walker Coonhound": {"size": "Large", "lifeExpectancy": 13},
    "Vizsla": {"size": "Medium", "lifeExpectancy": 13},
    "Weimaraner": {"size": "Large", "lifeExpectancy": 12},
    "Welsh Springer Spaniel": {"size": "Medium", "lifeExpectancy": 13},
    "Welsh Terrier": {"size": "Small", "lifeExpectancy": 13},
    "West Highland White Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Whippet": {"size": "Medium", "lifeExpectancy": 14},
    "Wire Fox Terrier": {"size": "Small", "lifeExpectancy": 13},
    "Wirehaired Pointing Griffon": {"size": "Large", "lifeExpectancy": 12},
    "Wirehaired Vizsla": {"size": "Medium", "lifeExpectancy": 13},
    "Xoloitzcuintli": {"size": "Medium", "lifeExpectancy": 14},
    "Yorkshire Terrier": {"size": "Small", "lifeExpectancy": 14},
    "Bernedoodle": {"size": "Large", "lifeExpectancy": 13},
    "Cockapoo": {"size": "Small", "lifeExpectancy": 14},
    "Maltipoo": {"size": "Small", "lifeExpectancy": 14},
    "Schnoodle": {"size": "Medium", "lifeExpectancy": 14},
    "Aussiedoodle": {"size": "Large", "lifeExpectancy": 13},
    "Pomsky": {"size": "Medium", "lifeExpectancy": 13},
}

SIZE_KEYWORDS = [
    (['giant', 'mastiff', 'saint bernard', 'newfoundland', 'leonberger',
      'wolfhound', 'deerhound', 'bernese', 'pyrenees', 'anatolian',
      'boerboel', 'dogue', 'kangal', 'greater swiss'], "Giant"),
    (['labrador', 'golden', 'german shepherd', 'boxer', 'husky',
      'malamute', 'akita', 'weimaraner', 'pointer', 'setter',
      'retriever', 'collie', 'shepherd', 'doberman', 'dalmatian',
      'afghan', 'vizsla', 'ridgeback', 'samoyed', 'chow', 'rottweiler',
      'shar-pei', 'greyhound', 'borzoi', 'airedale', 'bloodhound',
      'clumber', 'spinone', 'briard', 'bouvier', 'old english',
      'great dane', 'otterhound'], "Large"),
    (['chihuahua', 'yorkie', 'yorkshire', 'maltese', 'pomeranian',
      'shih tzu', 'pug', 'beagle', 'schnauzer', 'dachshund',
      'miniature', 'toy', 'bichon', 'lhasa', 'corgi', 'shetland',
      'cairn', 'west highland', 'scottish terrier', 'jack russell',
      'boston terrier', 'french bulldog', 'havanese', 'coton',
      'papillon', 'silky', 'affenpinscher', 'brussels', 'japanese chin',
      'pekingese', 'small', 'norwich', 'norfolk', 'lakeland',
      'bedlington', 'dandie', 'sealyham', 'skye', 'cesky',
      'schipperke', 'tibetan spaniel', 'lowchen', 'coton'], "Small"),
]

def guess_size(name):
    low = name.lower()
    for keywords, size in SIZE_KEYWORDS:
        if any(kw in low for kw in keywords):
            return size
    return "Medium"

def guess_le(size):
    return {"Small": 14, "Medium": 13, "Large": 12, "Giant": 10}.get(size, 12)

def build_dog(name):
    meta = BREED_META.get(name, {})
    size = meta.get('size') or guess_size(name)
    le   = meta.get('lifeExpectancy') or guess_le(size)
    return {"name": name, "lifeExpectancy": le, "size": size}

# Collect all dog names
all_dog_names = set()
for pid, p in pets.items():
    if p['species'] == 'Dog':
        all_dog_names.add(p['breed'])
all_dog_names |= set(BREED_META.keys())
# Remove blanks / cat-like entries
all_dog_names.discard('')
all_dog_names.discard('Mixed/Unknown')
all_dog_names.discard('Domestic Shorthair')
all_dog_names.discard('Domestic Longhair')

dog_entries = sorted([build_dog(n) for n in all_dog_names], key=lambda x: x['name'])
dog_entries.append({"name": "Mixed Breed / Unknown", "lifeExpectancy": 13, "size": "Medium"})

# CFA cats
CFA_CATS = [
    ("Abyssinian", 14), ("American Bobtail", 14), ("American Curl", 14),
    ("American Shorthair", 15), ("American Wirehair", 14), ("Balinese", 15),
    ("Bengal", 14), ("Birman", 14), ("Bombay", 14), ("British Shorthair", 14),
    ("Burmese", 14), ("Burmilla", 14), ("Chartreux", 14), ("Colorpoint Shorthair", 14),
    ("Cornish Rex", 14), ("Devon Rex", 14), ("Egyptian Mau", 14), ("European Burmese", 14),
    ("Exotic Shorthair", 14), ("Havana Brown", 14), ("Japanese Bobtail", 14),
    ("Javanese", 14), ("Khao Manee", 14), ("Korat", 14), ("Kurilian Bobtail", 14),
    ("LaPerm", 14), ("Lykoi", 12), ("Maine Coon", 13), ("Manx", 14),
    ("Norwegian Forest Cat", 14), ("Ocicat", 14), ("Oriental", 14), ("Persian", 13),
    ("Ragamuffin", 14), ("Ragdoll", 14), ("Russian Blue", 15), ("Scottish Fold", 13),
    ("Selkirk Rex", 14), ("Siamese", 15), ("Siberian", 14), ("Singapura", 14),
    ("Somali", 14), ("Sphynx", 13), ("Tonkinese", 14), ("Turkish Angora", 14),
    ("Turkish Van", 14),
]
cat_entries = [{"name": n, "lifeExpectancy": le} for n, le in CFA_CATS]
cat_entries += [
    {"name": "Domestic Shorthair", "lifeExpectancy": 14},
    {"name": "Domestic Longhair", "lifeExpectancy": 14},
    {"name": "Mixed/Unknown", "lifeExpectancy": 14},
]
cat_entries.sort(key=lambda x: x['name'])

breeds_data = {"dogs": dog_entries, "cats": cat_entries}
with open(os.path.join(OUT_DIR, 'breeds.json'), 'w') as f:
    json.dump(breeds_data, f, indent=2)

print(f"\nbreeds.json: {len(dog_entries)} dogs, {len(cat_entries)} cats")
print("\n=== DONE ===")
