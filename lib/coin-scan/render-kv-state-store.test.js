'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const K=require('./render-kv-state-store.js');

test('Render KV URL parser accepts internal redis URLs',()=>{
  const x=K.parseUrl('redis://red-example:6379');
  assert.equal(x.host,'red-example');assert.equal(x.port,6379);assert.equal(x.tls,false);assert.equal(x.password,'');
});
test('RESP encoder and parser handle bulk and simple replies',()=>{
  const cmd=K.resp(['SET','a','hello']);
  assert(cmd.toString().startsWith('*3\r\n$3\r\nSET\r\n'));
  assert.deepEqual(K.parseOne(Buffer.from('+OK\r\n')),{value:'OK',bytes:5});
  assert.deepEqual(K.parseOne(Buffer.from('$5\r\nhello\r\n')),{value:'hello',bytes:11});
  assert.deepEqual(K.parseOne(Buffer.from('$-1\r\n')),{value:null,bytes:5});
});
