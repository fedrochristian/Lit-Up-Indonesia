const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { emptyWorkspace, resources, paths } = require('../tmp/site-tests/catalog.js');
const { localRequest, readBody } = require('../tmp/site-tests/local-request.js');

test('catalog and versioned paths have valid references', () => {
  assert.equal(new Set(resources.map(r => r.id)).size, resources.length);
  for (const r of resources) { assert.equal(new URL(r.url).protocol, 'https:'); assert.ok(r.summary && r.accessNote && r.reviewed); }
  for (const p of paths) { assert.equal(p.version, 1); assert.equal(p.steps.length, 4); for (const s of p.steps) assert.ok(resources.some(r => r.id === s.resourceId)); }
});
test('only same-origin local JSON writes are accepted', () => {
  const req = (host, origin, type = 'application/json') => new Request(`http://${host}/api/workspace`, { method:'POST', headers:{ host, origin, 'Content-Type':type } });
  assert.equal(localRequest(req('localhost:3011','http://localhost:3011'),true),true);
  assert.equal(localRequest(req('127.0.0.1:3011','https://attacker.example'),true),false);
  assert.equal(localRequest(req('attacker.example','http://attacker.example'),true),false);
  assert.equal(localRequest(req('localhost:3011','http://localhost:3011','text/plain'),true),false);
});
test('body reader rejects invalid and oversized bodies', async () => {
  const req = body => new Request('http://localhost/api/workspace', { method:'POST', body });
  assert.deepEqual(await readBody(req('{"type":"bookmark"}')), {type:'bookmark'});
  await assert.rejects(readBody(req('[]')));
  await assert.rejects(readBody(req('x'.repeat(20001))));
  await assert.rejects(readBody(req('not json')));
});
test('workspace mutations are validated, idempotent, durable and preserve corruption', async () => {
  const previous = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), 'litup-store-test-'));
  process.chdir(directory);
  // Module resolves the data directory at import; tests never touch user storage.
  const store = require(path.join(previous, 'tmp/site-tests/workspace-store.js'));
  try {
    assert.deepEqual(await store.readWorkspace(), emptyWorkspace());
    const state = emptyWorkspace();
    store.applyAction(state, {type:'bookmark',id:'cs50',value:true});
    store.applyAction(state, {type:'bookmark',id:'cs50',value:true});
    assert.deepEqual(state.saved,['cs50']);
    assert.throws(()=>store.applyAction(state,{type:'complete',id:'first-code:think',value:true}));
    store.applyAction(state,{type:'plan',id:'first-code',value:true});
    store.applyAction(state,{type:'complete',id:'first-code:think',value:true});
    store.applyAction(state,{type:'complete',id:'first-code:think',value:true});
    assert.equal(state.completed.length,1);
    store.applyAction(state,{type:'reflection',id:'first-code:think',value:'A small practice note.'});
    store.applyAction(state,{type:'plan',id:'first-code',value:false});
    assert.equal(state.completed.length,1);
    assert.equal(state.reflections['first-code:think'],'A small practice note.');
    store.applyAction(state,{type:'plan',id:'first-code',value:true});
    store.applyAction(state,{type:'complete',id:'first-code:think',value:false});
    assert.equal(state.completed.length,0);
    assert.throws(()=>store.applyAction(state,{type:'bookmark',id:'unknown',value:true}));
    assert.throws(()=>store.applyAction(state,{type:'profile',value:{...state.profile,goal:''}}));
    assert.throws(()=>store.applyAction(state,{type:'reflection',id:'first-code:think',value:'x'.repeat(3001)}));
    await Promise.all(resources.map(r=>store.updateWorkspace({type:'bookmark',id:r.id,value:true})));
    const restored=await store.readWorkspace();
    assert.equal(restored.saved.length,resources.length);
    const savedFile=path.join(directory,'.local/workspace.json');
    assert.equal(JSON.parse(await readFile(savedFile,'utf8')).saved.length,resources.length);
    await writeFile(savedFile,'CORRUPT TEST DATA');
    await assert.rejects(store.updateWorkspace({type:'bookmark',id:'cs50',value:false}));
    assert.equal(await readFile(savedFile,'utf8'),'CORRUPT TEST DATA');
  } finally { process.chdir(previous); }
});
