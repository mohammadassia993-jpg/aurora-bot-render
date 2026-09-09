const RESULTS = [];

// Gitcoin - check if bounties page is accessible
async function scoutGitcoin() {
  try {
    const res = await fetch('https://gitcoin.co/bounties?status=open', { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const bountyMatches = html.match(/bounty\/(\d+)/g) || [];
    console.log('Gitcoin:', bountyMatches.length, 'bounty refs found');
    return { platform: 'Gitcoin', accessible: true, bountyRefs: bountyMatches.length };
  } catch (e) {
    console.log('Gitcoin error:', e.message);
    return { platform: 'Gitcoin', accessible: false, error: e.message };
  }
}

// Algora - check for open bounties
async function scoutAlgora() {
  try {
    const res = await fetch('https://algora.io/bounties', { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const bountyLinks = html.match(/\/bounties\/[^\s"']+/g) || [];
    const prices = html.match(/\$[\d,]+/g) || [];
    console.log('Algora:', bountyLinks.length, 'bounty links,', prices.length, 'prices found');
    return { platform: 'Algora', accessible: true, bountyLinks: bountyLinks.length, prices };
  } catch (e) {
    console.log('Algora error:', e.message);
    return { platform: 'Algora', accessible: false, error: e.message };
  }
}

// Immunefi - check for open bug bounties
async function scoutImmunefi() {
  try {
    const res = await fetch('https://immunefi.com/bug-bounties/', { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const programs = html.match(/bug-bounty\/[^\s"']+/g) || [];
    console.log('Immunefi:', programs.length, 'bug bounty programs');
    return { platform: 'Immunefi', accessible: true, programs: programs.length };
  } catch (e) {
    console.log('Immunefi error:', e.message);
    return { platform: 'Immunefi', accessible: false, error: e.message };
  }
}

// Superteam - check opportunities
async function scoutSuperteam() {
  try {
    const res = await fetch('https://app.superteam.build/opportunities', { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const opps = html.match(/opportunity\/[^\s"']+/g) || [];
    console.log('Superteam:', opps.length, 'opportunities');
    return { platform: 'Superteam', accessible: true, opportunities: opps.length };
  } catch (e) {
    console.log('Superteam error:', e.message);
    return { platform: 'Superteam', accessible: false, error: e.message };
  }
}

// Dework - check for tasks
async function scoutDework() {
  try {
    const res = await fetch('https://app.dework.xyz/explore', { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    return { platform: 'Dework', accessible: res.ok, status: res.status };
  } catch (e) {
    console.log('Dework error:', e.message);
    return { platform: 'Dework', accessible: false, error: e.message };
  }
}

// BountyCaster - check for bounties
async function scoutBountyCaster() {
  try {
    const res = await fetch('https://bountycaster.xyz/', { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    return { platform: 'BountyCaster', accessible: res.ok, status: res.status };
  } catch (e) {
    console.log('BountyCaster error:', e.message);
    return { platform: 'BountyCaster', accessible: false, error: e.message };
  }
}

// DeWork
async function scoutDeWork() {
  try {
    const res = await fetch('https://app.dework.xyz/', { signal: AbortSignal.timeout(10000) });
    return { platform: 'DeWork', accessible: res.ok };
  } catch (e) {
    return { platform: 'DeWork', accessible: false, error: e.message };
  }
}

// Replit Bounties
async function scoutReplitBounties() {
  try {
    const res = await fetch('https://replit.com/bounties', { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    return { platform: 'Replit Bounties', accessible: res.ok };
  } catch (e) {
    return { platform: 'Replit Bounties', accessible: false, error: e.message };
  }
}

console.log('=== Bounty & Platform Scout ===');
const results = await Promise.all([
  scoutGitcoin(), scoutAlgora(), scoutImmunefi(),
  scoutSuperteam(), scoutDework(), scoutBountyCaster(),
  scoutDeWork(), scoutReplitBounties()
]);
console.log('\n=== Results ===');
console.log(JSON.stringify(results, null, 2));
