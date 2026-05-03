export const prerender = false;

import type { APIRoute } from 'astro';

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'waspetinsuranceworthit-salt-2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function validate(body: any): { valid: boolean; error?: string } {
  if (!body) return { valid: false, error: 'Empty body' };
  if (!body.species || !['dog', 'cat'].includes(body.species)) {
    return { valid: false, error: 'Invalid species' };
  }
  if (!body.breed || typeof body.breed !== 'string' || body.breed.length > 100) {
    return { valid: false, error: 'Invalid breed' };
  }
  if (body.age_now_years == null || body.age_now_years < 0 || body.age_now_years > 30) {
    return { valid: false, error: 'Invalid age' };
  }
  if (body.age_acquired_years == null || body.age_acquired_years < 0 || body.age_acquired_years > body.age_now_years) {
    return { valid: false, error: 'Invalid age acquired' };
  }
  if (!body.total_vet_spend_bucket) {
    return { valid: false, error: 'Missing spending bucket' };
  }
  if (!body.verdict || typeof body.verdict !== 'string') {
    return { valid: false, error: 'Missing verdict' };
  }
  return { valid: true };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://waspetinsuranceworthit.com',
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await request.json();

    const { valid, error } = validate(body);
    if (!valid) {
      return new Response(JSON.stringify({ ok: false, error }), { status: 400, headers });
    }

    const clientIP =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for') ||
      'unknown';
    const ipHash = await hashIP(clientIP);

    const submissionId = generateId();
    const createdAt = Math.floor(Date.now() / 1000);

    const runtime = (locals as any).runtime;
    const db = runtime?.env?.DB;

    if (!db) {
      console.error('D1 binding not available');
      return new Response(JSON.stringify({ ok: false, error: 'Database unavailable' }), {
        status: 500,
        headers,
      });
    }

    await db
      .prepare(
        `INSERT INTO submissions (
          submission_id, created_at, ip_hash, species, breed,
          age_now_years, age_acquired_years, state_code,
          total_vet_spend_bucket, largest_bill_bucket, pct_routine,
          major_incidents, had_insurance, would_buy_again,
          verdict, verdict_dollars
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        submissionId,
        createdAt,
        ipHash,
        body.species,
        body.breed,
        body.age_now_years,
        body.age_acquired_years,
        body.state_code || null,
        body.total_vet_spend_bucket,
        body.largest_bill_bucket || null,
        body.pct_routine ?? null,
        body.major_incidents ? JSON.stringify(body.major_incidents) : null,
        body.had_insurance ? 1 : 0,
        body.would_buy_again === 'yes' ? 1 : body.would_buy_again === 'no' ? 0 : null,
        body.verdict,
        body.verdict_dollars ?? null
      )
      .run();

    return new Response(JSON.stringify({ ok: true, id: submissionId }), { status: 200, headers });
  } catch (err) {
    console.error('Submission error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Server error' }), {
      status: 500,
      headers,
    });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://waspetinsuranceworthit.com',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
