async function test() {
  const url = 'https://slt.ong';
  const res = await fetch(url, { method: 'GET', redirect: 'manual', headers: {'User-Agent': 'SLT-Status-Worker'} });
  console.log('slt.ong', res.status, res.ok);

  const url2 = 'https://share.slt.ong/heartbeat';
  const res2 = await fetch(url2, { method: 'GET', redirect: 'manual', headers: {'User-Agent': 'SLT-Status-Worker'} });
  console.log('share.slt.ong', res2.status, res2.ok);
}
test();
