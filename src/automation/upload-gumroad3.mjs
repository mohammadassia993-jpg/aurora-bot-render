const TOKEN = 'iGraY5xPBDRZo6tZztJKa5USTVUjRdvFkwvJd3o-psM';
const BASE = 'https://api.gumroad.com/v2';

// Try multipart form-data with FormData (Node 18+)
async function testFormData() {
  console.log('Testing with FormData...');
  const form = new FormData();
  form.append('access_token', TOKEN);
  form.append('product[name]', 'Test Web3 Product');
  form.append('product[price]', '10');
  form.append('product[description]', 'Test description');
  
  const res = await fetch(`${BASE}/products`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(30000)
  });
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

testFormData();
