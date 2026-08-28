async function testAuth() {
  const loginRes = await fetch('http://127.0.0.1:5173/api/auth/ldap-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': 'http://127.0.0.1:5173' },
    body: JSON.stringify({ usernameOrEmail: 'u.gasimli' }),
  });

  const cookie = loginRes.headers.get('set-cookie');
  console.log('Login status:', loginRes.status, 'Cookie:', cookie ? 'Received' : 'None');

  const headers: Record<string, string> = {
    'Origin': 'http://127.0.0.1:5173',
  };
  if (cookie) {
    headers['Cookie'] = cookie.split(';')[0];
  }

  const deptRes = await fetch('http://127.0.0.1:5173/api/departments', { headers });
  console.log('Departments status:', deptRes.status, await deptRes.json());

  const projRes = await fetch('http://127.0.0.1:5173/api/projects', { headers });
  console.log('Projects status:', projRes.status, await projRes.json());

  const cmdbRes = await fetch('http://127.0.0.1:5173/api/cmdb/cis', { headers });
  console.log('CMDB CIs status:', cmdbRes.status, await cmdbRes.json());

  const riskRes = await fetch('http://127.0.0.1:5173/api/risks', { headers });
  console.log('Risks status:', riskRes.status, await riskRes.json());
}

testAuth().catch(console.error);
