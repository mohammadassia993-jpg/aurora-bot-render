const TOKEN = 'iGraY5xPBDRZo6tZztJKa5USTVUjRdvFkwvJd3o-psM';
const BASE = 'https://api.gumroad.com/v2';

async function testSingle() {
  // First, test with minimal product
  console.log('Testing with minimal product...');
  const body = new URLSearchParams();
  body.append('access_token', TOKEN);
  body.append('product[name]', 'Test Product');
  body.append('product[price]', '100');
  body.append('product[description]', 'Test');
  
  const res = await fetch(`${BASE}/products`, {
    method: 'POST',
    body: body,
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
  
  if (data.success) {
    // Delete the test product
    const delRes = await fetch(`${BASE}/products/${data.product?.id}?access_token=${TOKEN}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(15000)
    });
    console.log('Deleted test:', await delRes.json());
  }
}

testSingle();
