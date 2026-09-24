const assert = require('node:assert/strict');
const base = process.env.LITUP_TEST_URL || 'http://127.0.0.1:3011';
async function main() {
  const root = await fetch(base);
  assert.equal(root.status, 200);
  assert.match(await root.text(), /Mau belajar apa hari ini/);
  assert.equal((await fetch(`${base}/journal`)).status, 200);
  const before = await (await fetch(`${base}/api/workspace`)).json();
  assert.equal(before.version, 1);
  const invalid = await fetch(`${base}/api/workspace`, {method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({type:'bookmark',id:'unknown-resource',value:true})});
  assert.equal(invalid.status,400);
  const foreign = await fetch(`${base}/api/workspace`, {method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.example'},body:'{}'});
  assert.equal(foreign.status,403);
  const oversized = await fetch(`${base}/api/workspace`, {method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({payload:'x'.repeat(21000)})});
  assert.equal(oversized.status,400);
  const after = await (await fetch(`${base}/api/workspace`)).json();
  assert.deepEqual(after,before);
  const status = await (await fetch(`${base}/api/tutor`)).json();
  if (!status.configured) {
    const disconnected = await fetch(`${base}/api/tutor`, {method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify({messages:[{role:'user',content:'Test'}]})});
    assert.equal(disconnected.status,503);
  }
  // Never make a paid API call in a smoke test.
  console.log('PASS: page, journal, workspace, validation, cross-origin rejection, body limits, unchanged data, tutor connection state.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
