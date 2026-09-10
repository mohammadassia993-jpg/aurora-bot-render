import fs from 'node:fs';

const GETXAPI_KEY = process.env.GETXAPI_KEY || 'get-x-api-91f01eddb00d62ef903cab8d65ef80cbde0941b40f6d790c';
const SUPERTEAM_KEY = process.env.SUPERTEAM_API_KEY || 'sk_0182978bc38504e97935255b540fbf54b86c9624256a568e9186cc3fad7b3d68';
const results = { opportunities: [], applied: [], errors: [] };

// ========= 1. Search Twitter/X for Web3 jobs =========
async function searchTwitter() {
  console.log('=== SEARCHING TWITTER/X ===');
  const queries = [
    'hiring web3 writer USDT',
    'web3 bounty USDT payment',
    'hiring blockchain translator',
    'web3 community manager hiring',
    'smart contract audit bounty',
    'web3 content writer remote',
    'DAO contributor hiring USDT',
    'web3 developer bounty',
  ];
  
  for (const q of queries) {
    try {
      const res = await fetch(`https://api.getxapi.com/v1/search?q=${encodeURIComponent(q)}&count=10`, {
        headers: { 'Authorization': 'Bearer ' + GETXAPI_KEY },
        signal: AbortSignal.timeout(15000)
      });
      const data = await res.json();
      const tweets = data.data || [];
      console.log(`  "${q}": ${tweets.length} results`);
      
      for (const tweet of tweets) {
        const text = tweet.text || '';
        const author = tweet.author?.username || 'unknown';
        
        // Filter: must mention hiring/bounty + USDT or payment
        const isJob = /hire|hiring|looking for|need|bounty|reward|paid|salary/i.test(text);
        const isWeb3 = /web3|blockchain|crypto|dao|defi|nft|token|smart.?contract/i.test(text);
        const hasPayment = /usdt|usdc|crypto|payment|paid|\$|dollar/i.test(text);
        const isNotRisky = !/investment|deposit|pay.*first|buy.*token/i.test(text);
        
        if (isJob && isWeb3 && isNotRisky) {
          const opp = {
            source: 'twitter',
            title: text.slice(0, 150),
            author: `@${author}`,
            url: tweet.id ? `https://x.com/${author}/status/${tweet.id}` : '',
            hasPayment,
            text: text.slice(0, 500),
            discovered_at: new Date().toISOString()
          };
          results.opportunities.push(opp);
          console.log(`  ✅ Found: ${text.slice(0, 80)}...`);
        }
      }
    } catch (e) {
      console.log(`  ❌ Error searching "${q}": ${e.message.slice(0, 80)}`);
      results.errors.push({ query: q, error: e.message.slice(0, 100) });
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

// ========= 2. Search Superteam Earn =========
async function searchSuperteam() {
  console.log('\n=== SEARCHING SUPERTEAM EARN ===');
  try {
    const res = await fetch('https://earn.superteam.io/api/bounties?status=open&limit=20', {
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    const bounties = data.bounties || data.data || [];
    console.log(`  Found ${bounties.length} bounties`);
    
    for (const b of bounties) {
      const title = b.title || b.name || '';
      const reward = b.reward || b.payment || b.compensation || {};
      const usdValue = reward.amount || reward.usd || 0;
      const tags = (b.tags || []).join(' ').toLowerCase();
      const desc = (b.description || b.body || '').toLowerCase();
      
      // Filter by criteria
      const isSimple = !tags.includes('engineering') || tags.includes('content') || tags.includes('writing');
      const isHighValue = usdValue >= 100;
      const isUSDT = /usdt|usdc|crypto|sol|token/i.test(tags + ' ' + desc);
      const isRelevant = /content|writing|translation|community|marketing|analysis|security/i.test(tags + ' ' + title + ' ' + desc);
      
      if ((isRelevant || isUSDT) && usdValue > 0) {
        const opp = {
          source: 'superteam',
          title: title.slice(0, 150),
          reward: `$${usdValue}`,
          url: b.url || `https://earn.superteam.io/bounties/${b.slug || b.id}`,
          tags: tags.slice(0, 200),
          deadline: b.deadline || 'open',
          discovered_at: new Date().toISOString()
        };
        results.opportunities.push(opp);
        console.log(`  ✅ ${title.slice(0, 60)} — $${usdValue}`);
      }
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message.slice(0, 100)}`);
    results.errors.push({ source: 'superteam', error: e.message.slice(0, 100) });
  }
}

// ========= 3. Search Remotive (Web3 jobs) =========
async function searchRemotive() {
  console.log('\n=== SEARCHING REMOTIVE ===');
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs?category=software-dev&search=web3&limit=20', {
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    const jobs = data.jobs || [];
    console.log(`  Found ${jobs.length} jobs`);
    
    for (const j of jobs) {
      const title = j.title || '';
      const company = j.company_name || '';
      const tags = (j.tags || []).join(' ').toLowerCase();
      const desc = (j.description || '').toLowerCase();
      
      const isWeb3 = /web3|blockchain|crypto|dao|defi|smart.?contract|solidity/i.test(title + ' ' + tags + ' ' + desc);
      const isContent = /content|writing|writer|translation|translator|community|marketing/i.test(title + ' ' + tags);
      
      if (isWeb3 || isContent) {
        const opp = {
          source: 'remotive',
          title: title.slice(0, 150),
          company,
          url: j.url || j.apply_url || '',
          salary: j.salary || 'Not specified',
          tags: tags.slice(0, 200),
          discovered_at: new Date().toISOString()
        };
        results.opportunities.push(opp);
        console.log(`  ✅ ${title.slice(0, 60)} @ ${company}`);
      }
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message.slice(0, 100)}`);
  }
}

// ========= 4. Search RemoteOK =========
async function searchRemoteOK() {
  console.log('\n=== SEARCHING REMOTEOK ===');
  try {
    const res = await fetch('https://remoteok.com/api', {
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    const jobs = Array.isArray(data) ? data.filter(j => j.id) : [];
    console.log(`  Total jobs: ${jobs.length}`);
    
    for (const j of jobs) {
      const title = j.position || '';
      const company = j.company || '';
      const tags = (j.tags || []).join(' ').toLowerCase();
      const desc = (j.description || '').toLowerCase();
      
      const isWeb3 = /web3|blockchain|crypto|dao|defi|solidity/i.test(title + ' ' + tags + ' ' + desc);
      const isContent = /content|writer|writing|translation|community|marketing/i.test(title + ' ' + tags);
      
      if (isWeb3 || isContent) {
        const opp = {
          source: 'remoteok',
          title: title.slice(0, 150),
          company,
          url: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
          salary: j.salary_min ? `$${j.salary_min}-${j.salary_max}` : 'Not specified',
          tags: tags.slice(0, 200),
          discovered_at: new Date().toISOString()
        };
        results.opportunities.push(opp);
        console.log(`  ✅ ${title.slice(0, 60)} @ ${company}`);
      }
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message.slice(0, 100)}`);
  }
}

// ========= 5. Search Gitcoin/Bounty platforms =========
async function searchGitcoin() {
  console.log('\n=== SEARCHING GITCOIN/BOUNTIES ===');
  try {
    const res = await fetch('https://gitcoin.co/api/v1/bounties/?status=open&format=json&limit=20', {
      signal: AbortSignal.timeout(15000)
    });
    const data = await res.json();
    const bounties = data.results || data || [];
    console.log(`  Found ${bounties.length} bounties`);
    
    for (const b of bounties) {
      const title = b.title || '';
      const value = b.value_usd || b.value || 0;
      const desc = (b.description || '').toLowerCase();
      
      const isRelevant = /content|writing|translation|analysis|security|community/i.test(title + ' ' + desc);
      
      if (isRelevant && value > 50) {
        const opp = {
          source: 'gitcoin',
          title: title.slice(0, 150),
          reward: `$${value}`,
          url: b.url || `https://gitcoin.co/bounties/${b.id}`,
          discovered_at: new Date().toISOString()
        };
        results.opportunities.push(opp);
        console.log(`  ✅ ${title.slice(0, 60)} — $${value}`);
      }
    }
  } catch (e) {
    console.log(`  ❌ Error: ${e.message.slice(0, 100)}`);
  }
}

// ========= RUN ALL =========
await searchTwitter();
await searchSuperteam();
await searchRemotive();
await searchRemoteOK();
await searchGitcoin();

// ========= SAVE RESULTS =========
const summary = {
  timestamp: new Date().toISOString(),
  total_found: results.opportunities.length,
  by_source: {},
  opportunities: results.opportunities.slice(0, 30),
  errors: results.errors
};

for (const opp of results.opportunities) {
  summary.by_source[opp.source] = (summary.by_source[opp.source] || 0) + 1;
}

fs.writeFileSync('/root/silent-giants/deliverables/job-search-results.json', JSON.stringify(summary, null, 2));
console.log(`\n=== SUMMARY ===`);
console.log(`Total opportunities found: ${summary.total_found}`);
console.log('By source:', JSON.stringify(summary.by_source));
console.log('Saved to deliverables/job-search-results.json');
